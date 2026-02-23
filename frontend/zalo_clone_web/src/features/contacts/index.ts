/**
 * Public API của Contacts feature module
 */

// Types
export * from './types';

// Components
export { FriendRequestModal } from './components/friend-request-modal';
export { FriendshipSearchModal } from './components/friendship-search-modal';
export { FriendCard } from './components/friend-card';
export { FriendList } from './components/friend-list';
export { FriendRequestList } from './components/friend-request-list';
export { BlockedList } from './components/blocked-list';

// API & Query hooks
export {
      friendshipKeys,
      friendshipApi,
      useFriendsList,
      useReceivedRequests,
      useSentRequests,
      useSendFriendRequest,
      useAcceptRequest,
      useDeclineRequest,
      useCancelRequest,
      useUnfriend,
      useCheckStatus,
      useMutualFriends,
      useFriendCount,
} from './api/friendship.api';

// Stores
export { useFriendshipStore } from './stores/friendship.store';

// Hooks
export { useFriendshipSocket } from './hooks/use-friendship-socket';
export type { FriendRequestTab } from './stores/friendship.store';

// Contacts API & Query Keys
export { contactsApi } from './api/contacts.api';
export { contactKeys, useContactCheck } from './hooks/use-contact-check';
export { useUpdateAlias } from './hooks/use-update-alias';
export { useContactsList, useRemoveContact } from './hooks/use-contacts-list';
export { useContactSocket } from './hooks/use-contact-socket';

// Contacts Components
export { AliasEditModal } from './components/alias-edit-modal';
export { ContactList } from './components/contact-list';
