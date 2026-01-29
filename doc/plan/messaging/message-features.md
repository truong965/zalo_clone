Implemented:
1-on-1 Messaging Complete - What We Built
Features

✅ Send text messages (with idempotency)
✅ Real-time delivery via WebSocket
✅ Offline message queue (7-day TTL)
✅ Delivery & seen receipts (double tick)
✅ Typing indicators
✅ Message pagination (cursor-based)
✅ Cross-server broadcast (Redis Pub/Sub)
✅ Soft delete messages
✅ Unread count tracking

// GROUP CHAT
Core Group Features:

✅ Create group (max 256 members)
✅ Update group (name, avatar, description)
✅ Add/remove members
✅ Leave group
✅ Dissolve group (admin only)
✅ Single ADMIN per group (enforced by DB constraint)
✅ Transfer admin rights (swap roles)

Member Approval System:

✅ Toggle requireApproval mode
✅ OPEN mode: Anyone can join directly
✅ APPROVAL mode: Join requests pending admin review
✅ Admin approve/reject requests
✅ Real-time notifications for requests

Additional Features:

✅ Pin messages (max 3 per group)
✅ Unpin messages
✅ Member status tracking (ACTIVE, KICKED, LEFT, PENDING)
✅ System messages for all actions
✅ Real-time events for all members

Schema Changes Summary:

✅ Added requireApproval to Conversation
✅ Added settings JSONB to Conversation
✅ Added status to ConversationMember
✅ Removed isActive (replaced by status)
✅ Added leftAt, kickedBy, kickedAt tracking
✅ Created GroupJoinRequest table
✅ Added unique constraint: 1 ADMIN per group