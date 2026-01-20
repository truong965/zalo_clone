-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- 1. Generic updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Update conversation's last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_last_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_last_message();

-- 3. Prevent messaging blocked users
CREATE OR REPLACE FUNCTION check_blocked_before_message()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM blocks
        WHERE (blocker_id = NEW.sender_id AND blocked_id IN (
            SELECT user_id FROM conversation_members 
            WHERE conversation_id = NEW.conversation_id AND user_id != NEW.sender_id
        ))
        OR (blocked_id = NEW.sender_id AND blocker_id IN (
            SELECT user_id FROM conversation_members 
            WHERE conversation_id = NEW.conversation_id AND user_id != NEW.sender_id
        ))
    ) THEN
        RAISE EXCEPTION 'Cannot send message to blocked user';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_blocked_message
    BEFORE INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION check_blocked_before_message();
	
-- =====================================================
-- TABLE: users
-- PURPOSE: Core user identity and profile
-- phone_number is UNIQUE — primary authentication method
-- search_vector for full-text search (find users by name/phone)
-- Soft delete with deleted_at (retain data for legal compliance)
-- last_seen_at updated via Redis (batch sync to DB every 5 mins)
-- =====================================================

CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

CREATE TABLE users (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    phone_country_code VARCHAR(5) NOT NULL DEFAULT '+84',
    
    -- Profile (Public)
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    bio TEXT CHECK (LENGTH(bio) <= 500),
    date_of_birth DATE,
    gender gender_type,
    
    -- Profile (Private - controlled by privacy settings)
    email VARCHAR(255) UNIQUE,
    
    -- System Fields
    status user_status DEFAULT 'active',
    is_verified BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    
    -- Security
    password_hash VARCHAR(255), -- For web login (optional)
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(32),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
    
    -- Search
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', 
            COALESCE(display_name, '') || ' ' || 
            COALESCE(phone_number, '')
        )
    ) STORED
);

-- Indexes
CREATE INDEX idx_users_phone ON users(phone_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON users(status) WHERE status = 'active';
CREATE INDEX idx_users_search ON users USING GIN(search_vector);
CREATE INDEX idx_users_last_seen ON users(last_seen_at DESC) WHERE status = 'active';

-- Trigger for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLE: privacy_settings
-- PURPOSE: User privacy preferences (Who can contact me?)
-- PATTERN: One-to-one with users
-- =====================================================

CREATE TYPE privacy_level AS ENUM ('everyone', 'contacts', 'nobody');

CREATE TABLE privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Profile Visibility
    show_avatar privacy_level DEFAULT 'everyone',
    show_bio privacy_level DEFAULT 'everyone',
    show_phone_number privacy_level DEFAULT 'contacts',
    show_last_seen privacy_level DEFAULT 'contacts',
    show_online_status privacy_level DEFAULT 'contacts',
    
    -- Communication Permissions
    who_can_message_me privacy_level DEFAULT 'everyone',
    who_can_call_me privacy_level DEFAULT 'contacts',
    who_can_add_to_groups privacy_level DEFAULT 'contacts',
    
    -- Read Receipts
    send_read_receipts BOOLEAN DEFAULT TRUE,
    send_typing_indicator BOOLEAN DEFAULT TRUE,
    
    -- Search & Discovery
    allow_search_by_phone BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Automatically create default privacy settings for new users
CREATE OR REPLACE FUNCTION create_default_privacy_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO privacy_settings (user_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_privacy_settings
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_privacy_settings();

	-- =====================================================
-- TABLE: friendships
-- PURPOSE: Manage friend relationships (bidirectional)
-- PATTERN: Each friendship = 1 row (not 2 rows)
-- =====================================================

CREATE TYPE friendship_status AS ENUM (
    'pending',    -- Friend request sent
    'accepted',   -- Both are friends
    'declined',   -- Request declined
    'cancelled'   -- Sender cancelled request
);

CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Always store with user1_id < user2_id (prevents duplicates)
    user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Who initiated the friendship
    requester_id UUID NOT NULL REFERENCES users(id),
    
    -- Status
    status friendship_status DEFAULT 'pending',
    
    -- Timestamps
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure user1_id < user2_id
    CONSTRAINT check_user_order CHECK (user1_id < user2_id),
    
    -- Prevent duplicate friendships
    CONSTRAINT unique_friendship UNIQUE (user1_id, user2_id)
);

-- Indexes for common queries
CREATE INDEX idx_friendships_user1 ON friendships(user1_id, status);
CREATE INDEX idx_friendships_user2 ON friendships(user2_id, status);
CREATE INDEX idx_friendships_status ON friendships(status) WHERE status = 'pending';

-- Helper function to normalize user IDs
CREATE OR REPLACE FUNCTION normalize_friendship_users(
    uid1 UUID, 
    uid2 UUID
) RETURNS TABLE(user1_id UUID, user2_id UUID) AS $$
BEGIN
    IF uid1 < uid2 THEN
        RETURN QUERY SELECT uid1, uid2;
    ELSE
        RETURN QUERY SELECT uid2, uid1;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
-- =====================================================
-- TABLE: blocks
-- PURPOSE: User blocking (unidirectional)
-- PATTERN: User A blocks User B (separate row if B blocks A)
-- =====================================================

CREATE TABLE blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    reason TEXT CHECK (LENGTH(reason) <= 500), -- Optional
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent self-blocking
    CONSTRAINT check_not_self_block CHECK (blocker_id != blocked_id),
    
    -- One block per pair
    CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id)
);

-- Indexes
CREATE INDEX idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);

-- When User A blocks User B:
-- 1. Remove friendship if exists
-- 2. Remove B from all of A's group conversations
CREATE OR REPLACE FUNCTION handle_user_block()
RETURNS TRIGGER AS $$
BEGIN
    -- Remove friendship
    DELETE FROM friendships
    WHERE (user1_id, user2_id) IN (
        SELECT * FROM normalize_friendship_users(NEW.blocker_id, NEW.blocked_id)
    );
    
    -- Remove from groups (handled in application layer for audit trail)
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_handle_block
    AFTER INSERT ON blocks
    FOR EACH ROW
    EXECUTE FUNCTION handle_user_block();
	-- =====================================================
-- TABLE: conversations
-- PURPOSE: Container for 1-on-1 and group chats
-- PATTERN: One row per conversation (regardless of type)
-- =====================================================

CREATE TYPE conversation_type AS ENUM ('direct', 'group', 'channel');

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    type conversation_type NOT NULL,
    
    -- Group-specific fields
    name VARCHAR(255), -- NULL for direct chats
    avatar_url TEXT,
    description TEXT CHECK (LENGTH(description) <= 1000),
    
    -- Metadata
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE,
    
    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Settings (JSONB for flexibility)
    settings JSONB DEFAULT '{
        "allow_members_to_add_others": true,
        "only_admins_can_send_messages": false,
        "message_retention_days": null
    }'::jsonb
);

-- Indexes
CREATE INDEX idx_conversations_type ON conversations(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_conversations_created_by ON conversations(created_by);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC NULLS LAST);
CREATE INDEX idx_conversations_settings ON conversations USING GIN(settings);

-- Trigger for updated_at
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
	-- =====================================================
-- TABLE: conversation_members
-- PURPOSE: Manage conversation participants and roles
-- PATTERN: Many-to-many with roles
-- =====================================================

CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE conversation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role (for group chats)
    role member_role DEFAULT 'member',
    
    -- Custom nickname in this conversation
    nickname VARCHAR(100),
    
    -- Notification settings (per conversation)
    notifications_enabled BOOLEAN DEFAULT TRUE,
    notification_sound VARCHAR(50) DEFAULT 'default',
    
    -- Read tracking
    last_read_message_id UUID, -- References messages(id) - added after messages table
    last_read_at TIMESTAMP WITH TIME ZONE,
    
    -- Membership status
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN GENERATED ALWAYS AS (left_at IS NULL) STORED,
    
    -- Added by whom
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    CONSTRAINT unique_conversation_member UNIQUE (conversation_id, user_id)
);

-- Indexes
CREATE INDEX idx_conv_members_conversation ON conversation_members(conversation_id) 
    WHERE is_active = TRUE;
CREATE INDEX idx_conv_members_user ON conversation_members(user_id) 
    WHERE is_active = TRUE;
CREATE INDEX idx_conv_members_role ON conversation_members(conversation_id, role);
CREATE INDEX idx_conv_members_unread ON conversation_members(user_id, last_read_at);

-- Ensure direct conversations have exactly 2 members
CREATE OR REPLACE FUNCTION check_direct_conversation_members()
RETURNS TRIGGER AS $$
DECLARE
    conv_type conversation_type;
    member_count INT;
BEGIN
    -- Get conversation type
    SELECT type INTO conv_type
    FROM conversations
    WHERE id = NEW.conversation_id;
    
    -- Count active members
    SELECT COUNT(*) INTO member_count
    FROM conversation_members
    WHERE conversation_id = NEW.conversation_id
    AND is_active = TRUE;
    
    -- For direct conversations, enforce exactly 2 members
    IF conv_type = 'direct' AND member_count > 2 THEN
        RAISE EXCEPTION 'Direct conversations must have exactly 2 members';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_direct_members
    AFTER INSERT OR UPDATE ON conversation_members
    FOR EACH ROW
    EXECUTE FUNCTION check_direct_conversation_members();
-- =====================================================
-- TABLE: messages
-- PURPOSE: Store all messages (text, media, system events)
-- SCALING: Partitioned by created_at (monthly partitions)
-- ESTIMATED ROWS: 100M+ messages (Year 1)
-- =====================================================

CREATE TYPE message_type AS ENUM (
    'text',
    'image',
    'video',
    'audio',
    'file',
    'sticker',
    'location',
    'contact',
    'system_event'  -- e.g., "User A added User B"
);

CREATE TYPE message_status AS ENUM (
    'sending',   -- Client-side, not yet sent
    'sent',      -- Delivered to server
    'delivered', -- Delivered to recipient(s)
    'read',      -- Read by recipient(s)
    'failed',    -- Failed to send
    'deleted'    -- Soft deleted
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    
    -- Message type
    type message_type NOT NULL DEFAULT 'text',
    
    -- Content
    content TEXT, -- NULL for media-only messages
    
    -- Metadata (JSONB for flexibility)
    metadata JSONB DEFAULT '{}'::jsonb,
    -- Examples:
    -- Text: {"mentions": ["user-id-1", "user-id-2"]}
    -- Media: {"width": 1920, "height": 1080, "duration": 120, "size": 5242880}
    -- Location: {"latitude": 10.762622, "longitude": 106.660172, "address": "..."}
    -- System: {"event_type": "member_added", "affected_user_id": "..."}
    
    -- Reply/Thread
    reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    
    -- Status tracking
    status message_status DEFAULT 'sent',
    
    -- Ordering (critical for message order)
    sequence_number BIGSERIAL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Edit history
    edited_at TIMESTAMP WITH TIME ZONE,
    is_edited BOOLEAN GENERATED ALWAYS AS (edited_at IS NOT NULL) STORED,
    
    -- Search
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', COALESCE(content, ''))
    ) STORED
) PARTITION BY RANGE (created_at);

-- Create partitions (monthly)
-- Sprint 1: Create first 3 months
CREATE TABLE messages_2025_01 PARTITION OF messages
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE messages_2025_02 PARTITION OF messages
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE messages_2025_03 PARTITION OF messages
    FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- Indexes (created on parent table, applied to all partitions)
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_sequence ON messages(conversation_id, sequence_number);
CREATE INDEX idx_messages_reply ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
CREATE INDEX idx_messages_search ON messages USING GIN(search_vector);
CREATE INDEX idx_messages_metadata ON messages USING GIN(metadata);

-- Function to auto-create next month's partition
CREATE OR REPLACE FUNCTION create_next_message_partition()
RETURNS void AS $$
DECLARE
    next_month DATE;
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    next_month := date_trunc('month', NOW() + INTERVAL '1 month');
    partition_name := 'messages_' || to_char(next_month, 'YYYY_MM');
    start_date := to_char(next_month, 'YYYY-MM-DD');
    end_date := to_char(next_month + INTERVAL '1 month', 'YYYY-MM-DD');
    
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF messages FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
END;
$$ LANGUAGE plpgsql;

-- Schedule with pg_cron (install extension first)
-- SELECT cron.schedule('create-message-partition', '0 0 1 * *', 'SELECT create_next_message_partition()');
-- =====================================================
-- TABLE: media_attachments
-- PURPOSE: Store media file references (S3 URLs)
-- PATTERN: One-to-many with messages
-- =====================================================

CREATE TYPE media_status AS ENUM ('uploading', 'processing', 'ready', 'failed');

CREATE TABLE media_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    
    -- File info
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL, -- MIME type: image/jpeg, video/mp4
    file_size BIGINT NOT NULL, -- Bytes
    
    -- Storage URLs (S3)
    original_url TEXT NOT NULL,
    thumbnail_url TEXT, -- For images/videos
    preview_url TEXT,   -- For documents
    
    -- Media-specific metadata
    width INTEGER, -- For images/videos
    height INTEGER,
    duration INTEGER, -- For audio/video (seconds)
    
    -- Processing status
    status media_status DEFAULT 'uploading',
    
    -- Timestamps
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    
    -- Security
    checksum VARCHAR(64), -- SHA-256 hash for deduplication
    virus_scan_status VARCHAR(20) DEFAULT 'pending'
);

-- Indexes
CREATE INDEX idx_media_message ON media_attachments(message_id);
CREATE INDEX idx_media_status ON media_attachments(status) WHERE status != 'ready';
CREATE INDEX idx_media_checksum ON media_attachments(checksum);
CREATE INDEX idx_media_uploaded ON media_attachments(uploaded_at DESC);
-- =====================================================
-- TABLE: message_receipts
-- PURPOSE: Track delivery and read status per user
-- PATTERN: One row per (message, user) pair
-- =====================================================

CREATE TYPE receipt_type AS ENUM ('delivered', 'read');

CREATE TABLE message_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    type receipt_type NOT NULL,
    
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_message_receipt UNIQUE (message_id, user_id, type)
);

-- Indexes
CREATE INDEX idx_receipts_message ON message_receipts(message_id);
CREATE INDEX idx_receipts_user ON message_receipts(user_id, received_at DESC);

-- Materialized view for quick "last read" lookup
CREATE MATERIALIZED VIEW conversation_last_read AS
SELECT 
    cm.conversation_id,
    cm.user_id,
    MAX(mr.received_at) AS last_read_at,
    MAX(m.sequence_number) AS last_read_sequence
FROM conversation_members cm
LEFT JOIN message_receipts mr ON mr.user_id = cm.user_id
LEFT JOIN messages m ON m.id = mr.message_id AND m.conversation_id = cm.conversation_id
WHERE mr.type = 'read' AND cm.is_active = TRUE
GROUP BY cm.conversation_id, cm.user_id;

CREATE UNIQUE INDEX idx_conv_last_read ON conversation_last_read(conversation_id, user_id);

-- Refresh periodically (every 5 minutes)
-- SELECT cron.schedule('refresh-last-read', '*/5 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY conversation_last_read');
-- =====================================================
-- TABLE: calls
-- PURPOSE: Track call history and metadata
-- PATTERN: One row per call attempt
-- =====================================================

CREATE TYPE call_type AS ENUM ('audio', 'video');
CREATE TYPE call_status AS ENUM (
    'initiated',  -- Call started
    'ringing',    -- Ringing on recipient's device
    'answered',   -- Call connected
    'declined',   -- Recipient declined
    'missed',     -- No answer
    'ended',      -- Normal termination
    'failed',     -- Technical failure
    'cancelled'   -- Caller cancelled before answer
);

CREATE TABLE calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Call type
    type call_type NOT NULL,
    
    -- Initiator
    caller_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    
    -- Status
    status call_status DEFAULT 'initiated',
    
    -- Timestamps
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    answered_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Duration (seconds)
    duration INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (ended_at - answered_at))::INTEGER
    ) STORED,
    
    -- Quality metrics (JSONB for flexibility)
    metrics JSONB DEFAULT '{}'::jsonb,
    -- Example: {
    --   "avg_bitrate": 128000,
    --   "packet_loss": 0.02,
    --   "jitter": 15,
    --   "turn_server_used": true
    -- }
    
    -- WebRTC session info
    session_id VARCHAR(255), -- For debugging with TURN server logs
    
    -- Failure reason (if applicable)
    failure_reason TEXT
);

-- Indexes
CREATE INDEX idx_calls_conversation ON calls(conversation_id, initiated_at DESC);
CREATE INDEX idx_calls_caller ON calls(caller_id, initiated_at DESC);
CREATE INDEX idx_calls_status ON calls(status) WHERE status IN ('initiated', 'ringing');
CREATE INDEX idx_calls_duration ON calls(duration DESC NULLS LAST);
-- =====================================================
-- TABLE: call_participants
-- PURPOSE: Track participants in group calls
-- PATTERN: Many-to-many (calls <-> users)
-- =====================================================

CREATE TYPE participant_status AS ENUM (
    'invited',   -- Invited but not yet joined
    'joining',   -- Connecting
    'connected', -- Actively in call
    'left',      -- Left the call
    'kicked'     -- Removed by admin
);

CREATE TABLE call_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    status participant_status DEFAULT 'invited',
    
    -- Timestamps
    joined_at TIMESTAMP WITH TIME ZONE,
    left_at TIMESTAMP WITH TIME ZONE,
    
    -- Quality metrics per participant
    metrics JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT unique_call_participant UNIQUE (call_id, user_id)
);

-- Indexes
CREATE INDEX idx_call_participants_call ON call_participants(call_id);
CREATE INDEX idx_call_participants_user ON call_participants(user_id, joined_at DESC);
CREATE INDEX idx_call_participants_status ON call_participants(status) WHERE status IN ('invited', 'joining', 'connected');
	=====================================================
-- TABLE: contact_sync
-- PURPOSE: Store synced phone contacts for "Find Friends"
-- PATTERN: One row per (user, contact_phone)
-- =====================================================

CREATE TABLE contact_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Contact info from phone
    contact_phone VARCHAR(20) NOT NULL,
    contact_name VARCHAR(255), -- Name from address book
    
    -- Matched user (if registered on Zalo)
    matched_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_contact UNIQUE (user_id, contact_phone)
);

-- Indexes
CREATE INDEX idx_contact_sync_user ON contact_sync(user_id);
CREATE INDEX idx_contact_sync_phone ON contact_sync(contact_phone);
CREATE INDEX idx_contact_sync_matched ON contact_sync(matched_user_id) WHERE matched_user_id IS NOT NULL;
=====================================================
-- TABLE: user_devices
-- PURPOSE: Track user devices for push notifications
-- PATTERN: One-to-many (users <-> devices)
-- =====================================================

CREATE TYPE device_type AS ENUM ('ios', 'android', 'web', 'desktop');

CREATE TABLE user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Device info
    device_type device_type NOT NULL,
    device_name VARCHAR(255), -- "iPhone 14 Pro", "Chrome on Windows"
    device_id VARCHAR(255) NOT NULL, -- Unique device identifier
    
    -- Push notification token
    fcm_token TEXT,
    apns_token TEXT, -- For iOS
    
    -- App version
    app_version VARCHAR(20),
    os_version VARCHAR(20),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_device UNIQUE (user_id, device_id)
);

-- Indexes
CREATE INDEX idx_devices_user ON user_devices(user_id) WHERE is_active = TRUE;
CREATE INDEX idx_devices_fcm ON user_devices(fcm_token) WHERE fcm_token IS NOT NULL;
CREATE INDEX idx_devices_last_active ON user_devices(last_active_at DESC);

-- -- PERFORMANCE OPTIMIZATIONS
-- --*1. Indexes Strategy**
-- -- High-traffic queries to optimize:
-- -- Q1: Get user's conversations (inbox)
-- EXPLAIN ANALYZE
-- SELECT c.*, cm.last_read_at, 
--        (SELECT COUNT(*) FROM messages m 
--         WHERE m.conversation_id = c.id 
--         AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')
--        ) AS unread_count
-- FROM conversations c
-- JOIN conversation_members cm ON cm.conversation_id = c.id
-- WHERE cm.user_id = 'user-uuid'
-- AND cm.is_active = TRUE
-- ORDER BY c.last_message_at DESC NULLS LAST
-- LIMIT 50;

-- -- Optimized with:
-- -- idx_conv_members_user
-- -- idx_conversations_last_message

-- -- Q2: Load messages in conversation (pagination)
-- EXPLAIN ANALYZE
-- SELECT m.*, u.display_name, u.avatar_url
-- FROM messages m
-- JOIN users u ON u.id = m.sender_id
-- WHERE m.conversation_id = 'conv-uuid'
-- AND m.deleted_at IS NULL
-- ORDER BY m.sequence_number DESC
-- LIMIT 50 OFFSET 0;

-- -- Optimized with:
-- -- idx_messages_conversation
-- -- idx_messages_sequence

-- -- Q3: Search messages globally
-- EXPLAIN ANALYZE
-- SELECT m.*, c.name AS conversation_name
-- FROM messages m
-- JOIN conversations c ON c.id = m.conversation_id
-- JOIN conversation_members cm ON cm.conversation_id = c.id
-- WHERE cm.user_id = 'user-uuid'
-- AND m.search_vector @@ to_tsquery('simple', 'hello:*')
-- ORDER BY m.created_at DESC
-- LIMIT 20;

-- --**2. Denormalization Strategies**
-- -- Option A: Cache unread count in conversation_members
-- ALTER TABLE conversation_members ADD COLUMN unread_count INTEGER DEFAULT 0;

-- -- Update via trigger
-- CREATE OR REPLACE FUNCTION update_unread_count()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     UPDATE conversation_members
--     SET unread_count = unread_count + 1
--     WHERE conversation_id = NEW.conversation_id
--     AND user_id != NEW.sender_id
--     AND is_active = TRUE;
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- -- Option B: Materialized view for conversation list
-- CREATE MATERIALIZED VIEW user_conversation_list AS
-- SELECT 
--     cm.user_id,
--     c.*,
--     cm.last_read_at,
--     cm.notifications_enabled,
--     (SELECT content FROM messages 
--      WHERE conversation_id = c.id 
--      ORDER BY created_at DESC LIMIT 1) AS last_message_preview,
--     (SELECT COUNT(*) FROM messages m
--      WHERE m.conversation_id = c.id
--      AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01')
--      AND m.sender_id != cm.user_id
--     ) AS unread_count
-- FROM conversation_members cm
-- JOIN conversations c ON c.id = cm.conversation_id
-- WHERE cm.is_active = TRUE;

-- CREATE INDEX idx_user_conv_list ON user_conversation_list(user_id, last_message_at DESC);
