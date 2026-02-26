/**
 * Messaging Module Types
 *
 * Message entities, receipt tracking and message-embedded media.
 */

import type { MediaType, MediaProcessingStatus } from './media.types';

// ============================================================================
// ENUMS
// ============================================================================

export const MessageType = {
      TEXT: 'TEXT',
      IMAGE: 'IMAGE',
      VIDEO: 'VIDEO',
      FILE: 'FILE',
      STICKER: 'STICKER',
      SYSTEM: 'SYSTEM',
      AUDIO: 'AUDIO',
      VOICE: 'VOICE',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const ReceiptStatus = {
      SENT: 'SENT',
      DELIVERED: 'DELIVERED',
      SEEN: 'SEEN',
} as const;

export type ReceiptStatus =
      (typeof ReceiptStatus)[keyof typeof ReceiptStatus];

// ============================================================================
// ENTITIES
// ============================================================================

export interface Message {
      id: string;
      conversationId: string;
      senderId?: string;
      type: MessageType;
      content?: string;
      metadata?: Record<string, unknown>;
      replyToId?: string;
      clientMessageId?: string;
      updatedById?: string;
      deletedById?: string;
      createdAt: string;
      updatedAt: string;
      deletedAt?: string;
}

export interface MessageSender {
      id: string;
      displayName: string;
      /** Resolved display name with contact priority: aliasName > phoneBookName > displayName */
      resolvedDisplayName?: string;
      avatarUrl?: string | null;
}

export interface MessageParentMessage {
      id: string;
      content?: string | null;
      senderId?: string | null;
      type?: MessageType;
      deletedAt?: string | null;
      sender?: MessageSender | null;
      mediaAttachments?: Pick<MessageMediaAttachmentItem, 'id' | 'mediaType' | 'originalName' | 'thumbnailUrl'>[];
}

/** @deprecated Legacy receipt item — kept for reference only */
export interface MessageReceiptItem {
      userId: string;
      status: ReceiptStatus;
      timestamp: string;
}

/** JSONB shape for direct (1v1) receipts stored on the message */
export interface DirectReceiptEntry {
      delivered: string | null;
      seen: string | null;
}

export type DirectReceipts = Record<string, DirectReceiptEntry>;

export interface MessageMediaAttachmentItem {
      id: string;
      mediaType: MediaType;
      mimeType?: string;
      cdnUrl?: string | null;
      thumbnailUrl?: string | null;
      optimizedUrl?: string | null;
      originalName: string;
      size: number;
      width?: number | null;
      height?: number | null;
      duration?: number | null;
      processingStatus: MediaProcessingStatus;
      /** Client-only: Object URL for local preview before server CDN is available */
      _localUrl?: string;
}

export interface MessageListItem extends Message {
      sender?: MessageSender | null;
      parentMessage?: MessageParentMessage | null;
      mediaAttachments?: MessageMediaAttachmentItem[];
      /** Number of recipients who received a delivery ack (group only) */
      deliveredCount?: number;
      /** Number of recipients who have seen the message (group counter / direct derived) */
      seenCount?: number;
      /** Total expected recipients excluding sender */
      totalRecipients?: number;
      /** Per-user delivery/seen timestamps for DIRECT conversations (null for GROUP) */
      directReceipts?: DirectReceipts | null;
}

/** @deprecated Legacy receipt — kept for reference only */
export interface MessageReceipt {
      messageId: string;
      userId: string;
      status: ReceiptStatus;
      timestamp: string;
}

// ============================================================================
// PINNED MESSAGE (Phase 3)
// ============================================================================

/** A pinned message returned by GET /conversations/:id/pinned-messages */
export interface PinnedMessageItem {
      id: string;
      content: string | null;
      type: MessageType;
      senderId: string | null;
      createdAt: string;
      deletedAt: string | null;
      sender: MessageSender | null;
      mediaAttachments: Pick<MessageMediaAttachmentItem, 'id' | 'mediaType' | 'originalName' | 'thumbnailUrl'>[];
}
