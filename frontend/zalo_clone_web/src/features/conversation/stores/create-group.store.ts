/**
 * Create Group Store — Zustand
 *
 * Manages modal state for the Create Group flow.
 * Components subscribe to specific slices via selectors
 * to minimize re-renders (rerender-derived-state).
 */

import { create } from 'zustand';
import { notification } from 'antd';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Max members a user can select (backend MAX_GROUP_SIZE=256, minus creator + buffer) */
export const MAX_SELECTED_MEMBERS = 250;

// ============================================================================
// TYPES
// ============================================================================

export interface SelectedMember {
      id: string;
      displayName: string;
      avatarUrl?: string;
}

export type SearchTab = 'friends' | 'strangers';

interface CreateGroupState {
      // Modal visibility
      isOpen: boolean;

      // Group info
      groupName: string;
      avatarFile: File | null;
      avatarPreview: string | null;

      // Member selection (Map for O(1) lookup)
      selectedMembers: Map<string, SelectedMember>;

      // Search
      searchKeyword: string;
      searchTab: SearchTab;

      // Loading
      isCreating: boolean;
      error: string | null;
}

interface CreateGroupActions {
      open: () => void;
      close: () => void;
      reset: () => void;
      setGroupName: (name: string) => void;
      setAvatarFile: (file: File | null) => void;
      toggleMember: (member: SelectedMember) => void;
      removeMember: (memberId: string) => void;
      setSearchKeyword: (keyword: string) => void;
      setSearchTab: (tab: SearchTab) => void;
      setCreating: (loading: boolean) => void;
      setError: (error: string | null) => void;
}

type CreateGroupStore = CreateGroupState & CreateGroupActions;

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: CreateGroupState = {
      isOpen: false,
      groupName: '',
      avatarFile: null,
      avatarPreview: null,
      selectedMembers: new Map(),
      searchKeyword: '',
      searchTab: 'friends',
      isCreating: false,
      error: null,
};

// ============================================================================
// STORE
// ============================================================================

export const useCreateGroupStore = create<CreateGroupStore>((set) => ({
      ...initialState,

      open: () => set({ isOpen: true }),

      close: () => set(initialState),

      reset: () => set(initialState),

      setGroupName: (groupName) => set({ groupName }),

      setAvatarFile: (file) => {
            // Revoke old preview URL to prevent memory leak
            set((state) => {
                  if (state.avatarPreview) {
                        URL.revokeObjectURL(state.avatarPreview);
                  }
                  return {
                        avatarFile: file,
                        avatarPreview: file ? URL.createObjectURL(file) : null,
                  };
            });
      },

      toggleMember: (member) =>
            set((state) => {
                  const next = new Map(state.selectedMembers);
                  if (next.has(member.id)) {
                        next.delete(member.id);
                  } else {
                        if (next.size >= MAX_SELECTED_MEMBERS) {
                              notification.warning({
                                    message: 'Đã đạt giới hạn thành viên',
                                    description: `Bạn chỉ có thể chọn tối đa ${MAX_SELECTED_MEMBERS} người.`,
                              });
                              return state;
                        }
                        next.set(member.id, member);
                  }
                  return { selectedMembers: next };
            }),

      removeMember: (memberId) =>
            set((state) => {
                  const next = new Map(state.selectedMembers);
                  next.delete(memberId);
                  return { selectedMembers: next };
            }),

      setSearchKeyword: (searchKeyword) => set({ searchKeyword }),

      setSearchTab: (searchTab) => set({ searchTab, searchKeyword: '' }),

      setCreating: (isCreating) => set({ isCreating }),

      setError: (error) => set({ error }),
}));

// ============================================================================
// SELECTORS (subscribe to derived values → avoid re-renders)
// ============================================================================

export const selectSelectedCount = (s: CreateGroupStore) =>
      s.selectedMembers.size;

export const selectCanCreate = (s: CreateGroupStore) =>
      s.groupName.trim().length > 0 &&
      s.selectedMembers.size >= 2 &&
      !s.isCreating;

/**
 * Returns selected member IDs as an array.
 * ⚠️ Always produces a new array reference — use with `useShallow` or
 *    call via `getState()` to avoid infinite re-render loops.
 */
export const selectSelectedIds = (s: CreateGroupStore) => [
      ...s.selectedMembers.keys(),
];

export const selectIsSelected = (id: string) => (s: CreateGroupStore) =>
      s.selectedMembers.has(id);
