/**
 * chat.store.ts — Zustand store for ephemeral chat UI state.
 *
 * Owns:
 * - selectedConversationId + sessionStorage persistence
 * - rightSidebar mode ('none' | 'search' | 'info')
 * - global search panel open/close
 * - friend search modal open/close
 * - search keyword prefill (for navigating from global search to in-conv search)
 * - typingUserIds per conversation
 */

import { create } from 'zustand';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import type { RightSidebarState } from '../types';
import type { ChatMessage } from '../types';

export type MediaBrowserTab = 'photos' | 'files';

/**
 * Lightweight snapshot of the message being replied to.
 * Kept minimal — just what ReplyPreviewBar + optimistic send need.
 */
export interface ReplyTarget {
      messageId: string;
      senderName: string;
      content?: string | null;
      type: string;
      mediaAttachments?: { mediaType: string; originalName: string }[];
}

interface ChatStoreState {
      // ── Selection ──────────────────────────────────────────────────────────
      selectedId: string | null;

      // ── Sidebar / panels ──────────────────────────────────────────────────
      rightSidebar: RightSidebarState;
      isGlobalSearchOpen: boolean;
      isFriendSearchOpen: boolean;
      prefillSearchKeyword: string | undefined;

      // ── Media Browser ──────────────────────────────────────────────────────
      mediaBrowserTab: MediaBrowserTab;

      // ── Typing ────────────────────────────────────────────────────────────
      typingUserIds: string[];

      // ── Reply ─────────────────────────────────────────────────────────────
      replyTarget: ReplyTarget | null;
}

interface ChatStoreActions {
      setSelectedId: (id: string | null) => void;
      setRightSidebar: (value: RightSidebarState | ((prev: RightSidebarState) => RightSidebarState)) => void;
      setIsGlobalSearchOpen: (open: boolean) => void;
      setIsFriendSearchOpen: (open: boolean) => void;
      setPrefillSearchKeyword: (keyword: string | undefined) => void;
      setMediaBrowserTab: (tab: MediaBrowserTab) => void;
      setTypingUserIds: (updater: string[] | ((prev: string[]) => string[])) => void;
      setReplyTarget: (target: ReplyTarget | null) => void;
}

export const useChatStore = create<ChatStoreState & ChatStoreActions>((set) => ({
      // ── Initial state ───────────────────────────────────────────────────────
      selectedId: sessionStorage.getItem(STORAGE_KEYS.CHAT_SELECTED_ID) ?? null,
      rightSidebar: 'none',
      isGlobalSearchOpen: false,
      isFriendSearchOpen: false,
      prefillSearchKeyword: undefined,
      mediaBrowserTab: 'photos',
      typingUserIds: [],
      replyTarget: null,

      // ── Actions ─────────────────────────────────────────────────────────────
      setSelectedId: (id) => {
            if (id) {
                  sessionStorage.setItem(STORAGE_KEYS.CHAT_SELECTED_ID, id);
            } else {
                  sessionStorage.removeItem(STORAGE_KEYS.CHAT_SELECTED_ID);
            }
            set({ selectedId: id });
      },

      setRightSidebar: (value) =>
            set((state) => ({
                  rightSidebar: typeof value === 'function' ? value(state.rightSidebar) : value,
            })),

      setIsGlobalSearchOpen: (open) => set({ isGlobalSearchOpen: open }),
      setIsFriendSearchOpen: (open) => set({ isFriendSearchOpen: open }),
      setPrefillSearchKeyword: (keyword) => set({ prefillSearchKeyword: keyword }),
      setMediaBrowserTab: (tab) => set({ mediaBrowserTab: tab }),

      setTypingUserIds: (updater) =>
            set((state) => ({
                  typingUserIds: typeof updater === 'function' ? updater(state.typingUserIds) : updater,
            })),

      setReplyTarget: (target) => set({ replyTarget: target }),
}));
