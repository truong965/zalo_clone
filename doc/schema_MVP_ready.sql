-- =====================================================
-- ZALO CLONE MVP SCHEMA - FINAL CLEAN VERSION
-- Target: PostgreSQL 14+
-- Structure: Consolidated Tables & Indexes
-- =====================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 2. UTILITY FUNCTIONS
-- =====================================================

-- Auto update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper to normalize user IDs (Ensure consistent order for friends)
CREATE OR REPLACE FUNCTION normalize_friendship_users(uid1 UUID, uid2 UUID)
RETURNS TABLE(user1_id UUID, user2_id UUID) AS $$
BEGIN
    IF uid1 < uid2 THEN
        RETURN QUERY SELECT uid1, uid2;
    ELSE
        RETURN QUERY SELECT uid2, uid1;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 3. USERS & PRIVACY
-- =====================================================

CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'deleted');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');
CREATE TYPE system_role_type AS ENUM ('user', 'admin', 'moderator');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    phone_country_code VARCHAR(5) NOT NULL DEFAULT '+84',
    
    -- Public Profile
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    date_of_birth DATE,
    gender gender_type,
    
    -- System Info
    status user_status DEFAULT 'active',
    system_role system_role_type NOT NULL DEFAULT 'user',
    last_seen_at TIMESTAMP WITH TIME ZONE,
    
    -- Auth & Security
    password_hash VARCHAR(255), 
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Full Text Search Vector
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', COALESCE(display_name, '') || ' ' || COALESCE(phone_number, ''))
    ) STORED
);

-- Indexes for Users
CREATE INDEX idx_users_phone ON users(phone_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_search ON users USING GIN(search_vector);
CREATE INDEX idx_users_system_role ON users(system_role);

-- Privacy Settings
CREATE TYPE privacy_level AS ENUM ('everyone', 'contacts', 'nobody');

CREATE TABLE privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- Visibility
    show_online_status privacy_level DEFAULT 'contacts',
    show_phone_number privacy_level DEFAULT 'contacts',
    
    -- Interaction
    who_can_message_me privacy_level DEFAULT 'everyone',
    who_can_call_me privacy_level DEFAULT 'contacts',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger for Privacy
CREATE OR REPLACE FUNCTION create_default_privacy_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO privacy_settings (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_privacy_settings
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_default_privacy_settings();

-- =====================================================
-- 4. SOCIAL GRAPH (FRIENDS & BLOCKS)
-- =====================================================

CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES users(id),
    
    status friendship_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT check_user_order CHECK (user1_id < user2_id),
    CONSTRAINT unique_friendship UNIQUE (user1_id, user2_id)
);

CREATE INDEX idx_friendships_user1 ON friendships(user1_id, status);
CREATE INDEX idx_friendships_user2 ON friendships(user2_id, status);

-- Blocks
CREATE TABLE blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id)
);

-- =====================================================
-- 5. CORE CHAT (CONVERSATIONS)
-- =====================================================

CREATE TYPE conversation_type AS ENUM ('direct', 'group');
CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type conversation_type NOT NULL,
    
    name VARCHAR(255),
    avatar_url TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE,
    
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC NULLS LAST);

-- Conversation Members
CREATE TABLE conversation_members (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    role member_role DEFAULT 'member',
    
    -- Read Status & Counts
    last_read_message_id UUID, 
    last_read_at TIMESTAMP WITH TIME ZONE,
    unread_count INTEGER DEFAULT 0, -- Integrated from ALTER
    
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    
    PRIMARY KEY (conversation_id, user_id)
);

-- Indexes for Members
CREATE INDEX idx_conv_members_unread ON conversation_members(user_id, unread_count DESC) WHERE is_active = TRUE;
CREATE INDEX idx_conv_members_user_conversation ON conversation_members(user_id, conversation_id) WHERE is_active = TRUE;

-- =====================================================
-- 6. MESSAGES
-- =====================================================

CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'file', 'sticker', 'system');

CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    type message_type NOT NULL DEFAULT 'text',
    content TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    reply_to_message_id BIGINT REFERENCES messages(id) ON DELETE SET NULL,
    
    -- Audit
    deleted_by UUID REFERENCES users(id), -- Integrated from ALTER
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Search
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', COALESCE(content, ''))
    ) STORED
);

CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_search ON messages USING GIN(search_vector);
CREATE INDEX idx_messages_metadata ON messages USING GIN(metadata);

-- Trigger for last_message update
CREATE TRIGGER trigger_update_last_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- =====================================================
-- 7. MEDIA & DEVICES
-- =====================================================

CREATE TABLE media_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    
    url TEXT NOT NULL,
    type VARCHAR(50),
    size BIGINT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE -- Integrated from ALTER
);

CREATE TABLE user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    device_id VARCHAR(255) NOT NULL,
    fcm_token TEXT,
    platform VARCHAR(20),
    
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_device UNIQUE (user_id, device_id)
);

-- =====================================================
-- END OF SCHEMA
-- =====================================================