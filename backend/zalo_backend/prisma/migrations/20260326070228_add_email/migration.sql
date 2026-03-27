-- DropForeignKey
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_blocked_id_fkey";

-- DropForeignKey
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_blocker_id_fkey";

-- DropForeignKey
ALTER TABLE "call_history" DROP CONSTRAINT "call_history_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "call_history" DROP CONSTRAINT "call_history_initiator_id_fkey";

-- DropForeignKey
ALTER TABLE "call_participants" DROP CONSTRAINT "call_participants_kicked_by_fkey";

-- DropForeignKey
ALTER TABLE "call_participants" DROP CONSTRAINT "call_participants_user_id_fkey";

-- DropForeignKey
ALTER TABLE "conversation_members" DROP CONSTRAINT "conversation_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_last_action_by_fkey";

-- DropForeignKey
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_requester_id_fkey";

-- DropForeignKey
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_user1_id_fkey";

-- DropForeignKey
ALTER TABLE "friendships" DROP CONSTRAINT "friendships_user2_id_fkey";

-- DropForeignKey
ALTER TABLE "group_join_requests" DROP CONSTRAINT "group_join_requests_inviter_id_fkey";

-- DropForeignKey
ALTER TABLE "group_join_requests" DROP CONSTRAINT "group_join_requests_reviewed_by_fkey";

-- DropForeignKey
ALTER TABLE "group_join_requests" DROP CONSTRAINT "group_join_requests_user_id_fkey";

-- DropForeignKey
ALTER TABLE "media_attachments" DROP CONSTRAINT "media_attachments_message_id_fkey";

-- DropForeignKey
ALTER TABLE "media_attachments" DROP CONSTRAINT "media_attachments_uploaded_by_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_deleted_by_fkey";

-- DropForeignKey
ALTER TABLE "messages" DROP CONSTRAINT "messages_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "user_contacts" DROP CONSTRAINT "user_contacts_contact_user_id_fkey";

-- DropForeignKey
ALTER TABLE "user_contacts" DROP CONSTRAINT "user_contacts_owner_id_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" VARCHAR(255);
