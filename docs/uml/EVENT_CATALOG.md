# Event Catalog

| Event | Producer | Consumer | Trigger | Payload key fields | Delivery | Idempotency |
|---|---|---|---|---|---|---|
| `auth.login.succeeded` | Auth Module | Notification, Audit | Login thành công | `userId`, `deviceId`, `loginAt` | At-least-once | `eventId` |
| `auth.login.approval.requested` | Auth Module | Trusted device app, Notification | Login thiết bị lạ | `approvalId`, `userId`, `expiresAt` | At-least-once | `approvalId` |
| `auth.login.approval.responded` | Trusted device app | Auth Module | Approve/reject login | `approvalId`, `decision`, `respondedAt` | At-least-once | first-writer-wins |
| `friend.request.created` | Friendship Module | Realtime, Notification | Gửi lời mời kết bạn | `requestId`, `fromUserId`, `toUserId` | At-least-once | `requestId` |
| `friend.request.accepted` | Friendship Module | Realtime, Conversation | Chấp nhận lời mời | `requestId`, `userA`, `userB` | At-least-once | upsert relation |
| `friend.request.rejected` | Friendship Module | Realtime | Từ chối lời mời | `requestId`, `rejectedBy` | At-least-once | request state check |
| `conversation.created` | Conversation Module | Realtime, Search indexer | Tạo hội thoại | `conversationId`, `memberIds`, `type` | At-least-once | upsert by `conversationId` |
| `message.created` | Message Module | Realtime, Notification, Search indexer | Gửi tin nhắn | `messageId`, `conversationId`, `senderId` | At-least-once | `messageId` |
| `message.edited` | Message Module | Realtime, Search indexer | Sửa tin nhắn | `messageId`, `editorId`, `version` | At-least-once | optimistic version check |
| `message.recalled` | Message Module | Realtime, Search indexer | Thu hồi tin nhắn | `messageId`, `recalledBy` | At-least-once | ignore duplicate |
| `message.delivered` | Realtime/Client ack | Message Module | Client nhận message | `messageId`, `receiverId`, `deliveredAt` | At-least-once | (`messageId`,`receiverId`) |
| `message.read` | Client/API | Message Module, Realtime | Client đọc message | `messageId`, `readerId`, `readAt` | At-least-once | monotonic timestamp |
| `call.invited` | Call Module | Realtime, Notification | Bắt đầu cuộc gọi | `callId`, `callerId`, `calleeIds` | At-least-once | `callId` |
| `call.accepted` | Call Module | Realtime | Người nhận bắt máy | `callId`, `userId`, `acceptedAt` | At-least-once | call state guard |
| `call.rejected` | Call Module | Realtime | Người nhận từ chối | `callId`, `userId`, `reason` | At-least-once | call state guard |
| `call.ended` | Call Module | Realtime, Analytics | Kết thúc cuộc gọi | `callId`, `durationSec`, `endedAt` | At-least-once | final-state lock |
| `notification.push.requested` | Domain modules | Notification Module | User offline cần push | `userId`, `title`, `deeplink` | At-least-once | payload hash key |

## Event handling policies

- Every event includes `eventId`, `schemaVersion`, `occurredAt`, `correlationId`.
- Consumers store processed event IDs for dedupe.
- Partition key should be `conversationId` for messaging events and `callId` for call events.
- Retries use exponential backoff; poison messages go to dead-letter queue.
