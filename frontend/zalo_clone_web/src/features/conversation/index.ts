// features/conversation barrel export

// API
export {
      conversationApi,
      conversationService,
      type ConversationMemberInfo,
} from './api/conversation.api';

// Components
export { CreateGroupModal } from './components/create-group-modal';
export { GroupList, GroupListItemCard } from './components/group-list';

// Hooks
export {
      useConversationSocket,
      useConversationListRealtime,
      useConversationsList,
      useArchivedConversationsList,
      useUserGroups,
      useConversationById,
      useConversationMembers,
      useContactSearch,
      useInvalidateConversations,
      conversationKeys,
      useFriendSearch,
      useCreateGroup,
      useGroupNotifications,
      usePinConversation,
      usePinMessage,
      pinnedMessagesKey,
      useMuteConversation,
      useArchiveConversation,
} from './hooks';

// Stores
export { useCreateGroupStore } from './stores/create-group.store';

// Types
export type {
      GroupListItem,
      ContactSearchResult,
      ContactSearchParams,
} from './types';
