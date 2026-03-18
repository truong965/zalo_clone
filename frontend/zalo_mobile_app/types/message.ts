export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'FILE',
  STICKER = 'STICKER',
  SYSTEM = 'SYSTEM',
  VOICE = 'VOICE',
}

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
  attachments?: MessageAttachment[];
  replyTo?: Message;
  clientMessageId?: string;
  metadata?: Record<string, unknown>;
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

export interface MessageListResponse {
  data: Message[];
  nextCursor?: string;
  hasMore: boolean;
}
