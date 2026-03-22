export const MessageType = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  FILE: 'FILE',
  STICKER: 'STICKER',
  SYSTEM: 'SYSTEM',
  AUDIO: 'AUDIO',
  VOICE: 'VOICE'
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

export interface Sender {
  id: string;
  displayName: string;
  avatarUrl?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content?: string;
  type: MessageType;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  sender: Sender;
  attachments?: MessageAttachment[]; // Deprecated, use mediaAttachments instead
  mediaAttachments?: MessageMediaAttachmentItem[];
  replyTo?: Message;
  parentMessage?: any;
  clientMessageId?: string;
  metadata?: Record<string, unknown>;
  
  // Receipts/Tracking
  deliveredCount?: number;
  seenCount?: number;
  totalRecipients?: number;
  directReceipts?: Record<string, { delivered: string | null; seen: string | null }> | null;
}

export interface MessageAttachment {
  id: string;
  url: string;
  type: string;
  name?: string;
  size?: number;
  thumbnailUrl?: string;
  metadata?: any;
}

export interface MessageMediaAttachmentItem {
  id: string;
  mediaType: string;
  mimeType?: string;
  cdnUrl?: string;
  thumbnailUrl?: string;
  optimizedUrl?: string;
  originalName: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  processingStatus: string;
  _localUrl?: string;
}

export interface MessageListResponse {
  data: Message[];
  nextCursor?: string;
  hasMore: boolean;
}
