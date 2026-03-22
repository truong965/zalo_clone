import { create } from 'zustand';

export interface ReplyTarget {
  messageId: string;
  senderName: string;
  content?: string | null;
  type: string;
  mediaAttachments?: Array<{
    mediaType: string;
    originalName: string;
  }>;
}

interface ChatState {
  replyTarget: ReplyTarget | null;
  setReplyTarget: (target: ReplyTarget | null) => void;
  clearReplyTarget: () => void;
  jumpToMessageId: string | null;
  setJumpToMessageId: (id: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  replyTarget: null,
  setReplyTarget: (target) => set({ replyTarget: target }),
  clearReplyTarget: () => set({ replyTarget: null }),
  jumpToMessageId: null,
  setJumpToMessageId: (id) => set({ jumpToMessageId: id }),
}));
