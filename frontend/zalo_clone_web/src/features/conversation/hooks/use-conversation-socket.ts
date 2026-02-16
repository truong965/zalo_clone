/**
 * Conversation Socket Hook
 *
 * Moved from hooks/use-conversation-socket.ts to features/conversation/hooks/
 * Handles all group-related socket events (listeners + emitters).
 */
import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/hooks/use-socket';
import { SocketEvents } from '@/constants/socket-events';
import type { Conversation } from '@/types/api';

type GroupCreatedPayload = { group: Conversation };
type GroupUpdatedPayload = { conversationId: string; updates: Partial<Conversation> };
type GroupMembersAddedPayload = { conversationId: string; memberIds: string[] };
type GroupMemberRemovedPayload = { conversationId: string; memberId: string };
type GroupMemberLeftPayload = { conversationId: string; memberId: string };
type GroupDissolvedPayload = { conversationId: string };
type GroupYouWereRemovedPayload = { conversationId: string; removedBy: string };
type GroupMemberJoinedPayload = { conversationId: string; userId: string };
type GroupAdminTransferredPayload = { conversationId: string; oldAdminId: string; newAdminId: string };
type GroupJoinRequestReceivedPayload = { conversationId: string; requestId: string; userId: string };

/**
 * Socket ack response type.
 * WsTransformInterceptor wraps handler return as { success, data: T }.
 * Error responses carry { error: string }.
 */
type WsWrapped<T> = { success: boolean; data: T };
type SocketAck<T> = WsWrapped<T> | { error: string };

interface ConversationSocketHandlers {
      onConversationCreated?: (conversation: Conversation) => void;
      onConversationUpdated?: (conversation: Conversation) => void;
      onGroupCreated?: (data: GroupCreatedPayload) => void;
      onGroupUpdated?: (data: GroupUpdatedPayload) => void;
      onGroupMembersAdded?: (data: GroupMembersAddedPayload) => void;
      onGroupMemberRemoved?: (data: GroupMemberRemovedPayload) => void;
      onGroupMemberLeft?: (data: GroupMemberLeftPayload) => void;
      onGroupDissolved?: (data: GroupDissolvedPayload) => void;
      onGroupYouWereRemoved?: (data: GroupYouWereRemovedPayload) => void;
      onGroupMemberJoined?: (data: GroupMemberJoinedPayload) => void;
      onGroupAdminTransferred?: (data: GroupAdminTransferredPayload) => void;
      onGroupJoinRequestReceived?: (data: GroupJoinRequestReceivedPayload) => void;
}

export function useConversationSocket(handlers: ConversationSocketHandlers) {
      const { socket, isConnected } = useSocket();

      // FIX: Store handlers in ref to avoid re-registration
      const handlersRef = useRef(handlers);

      useEffect(() => {
            handlersRef.current = handlers;
      }, [handlers]);

      // Setup listeners ONCE
      useEffect(() => {
            if (!socket || !isConnected) return;

            const onGroupCreated = (data: GroupCreatedPayload) => {
                  try {
                        handlersRef.current.onGroupCreated?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            const onGroupUpdated = (data: GroupUpdatedPayload) => {
                  try {
                        handlersRef.current.onGroupUpdated?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            const onGroupMembersAdded = (data: GroupMembersAddedPayload) => {
                  try {
                        handlersRef.current.onGroupMembersAdded?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            const onGroupMemberRemoved = (data: GroupMemberRemovedPayload) => {
                  try {
                        handlersRef.current.onGroupMemberRemoved?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            const onGroupMemberLeft = (data: GroupMemberLeftPayload) => {
                  try {
                        handlersRef.current.onGroupMemberLeft?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            const onGroupDissolved = (data: GroupDissolvedPayload) => {
                  try {
                        handlersRef.current.onGroupDissolved?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            const onGroupYouWereRemoved = (data: GroupYouWereRemovedPayload) => {
                  try {
                        handlersRef.current.onGroupYouWereRemoved?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            const onGroupMemberJoined = (data: GroupMemberJoinedPayload) => {
                  try {
                        handlersRef.current.onGroupMemberJoined?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            const onGroupAdminTransferred = (data: GroupAdminTransferredPayload) => {
                  try {
                        handlersRef.current.onGroupAdminTransferred?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            const onGroupJoinRequestReceived = (data: GroupJoinRequestReceivedPayload) => {
                  try {
                        handlersRef.current.onGroupJoinRequestReceived?.(data);
                  } catch {
                        // ignore handler errors
                  }
            };

            // Register all listeners
            socket.on(SocketEvents.GROUP_CREATED, onGroupCreated);
            socket.on(SocketEvents.GROUP_UPDATED, onGroupUpdated);
            socket.on(SocketEvents.GROUP_MEMBERS_ADDED, onGroupMembersAdded);
            socket.on(SocketEvents.GROUP_MEMBER_REMOVED, onGroupMemberRemoved);
            socket.on(SocketEvents.GROUP_MEMBER_LEFT, onGroupMemberLeft);
            socket.on(SocketEvents.GROUP_DISSOLVED, onGroupDissolved);
            socket.on(SocketEvents.GROUP_YOU_WERE_REMOVED, onGroupYouWereRemoved);
            socket.on(SocketEvents.GROUP_MEMBER_JOINED, onGroupMemberJoined);
            socket.on(SocketEvents.GROUP_ADMIN_TRANSFERRED, onGroupAdminTransferred);
            socket.on(SocketEvents.GROUP_JOIN_REQUEST_RECEIVED, onGroupJoinRequestReceived);

            // Cleanup
            return () => {
                  socket.off(SocketEvents.GROUP_CREATED, onGroupCreated);
                  socket.off(SocketEvents.GROUP_UPDATED, onGroupUpdated);
                  socket.off(SocketEvents.GROUP_MEMBERS_ADDED, onGroupMembersAdded);
                  socket.off(SocketEvents.GROUP_MEMBER_REMOVED, onGroupMemberRemoved);
                  socket.off(SocketEvents.GROUP_MEMBER_LEFT, onGroupMemberLeft);
                  socket.off(SocketEvents.GROUP_DISSOLVED, onGroupDissolved);
                  socket.off(SocketEvents.GROUP_YOU_WERE_REMOVED, onGroupYouWereRemoved);
                  socket.off(SocketEvents.GROUP_MEMBER_JOINED, onGroupMemberJoined);
                  socket.off(SocketEvents.GROUP_ADMIN_TRANSFERRED, onGroupAdminTransferred);
                  socket.off(SocketEvents.GROUP_JOIN_REQUEST_RECEIVED, onGroupJoinRequestReceived);
            };
      }, [socket, isConnected]);

      // Emit: Create Group
      const createGroup = useCallback((dto: {
            name: string;
            memberIds: string[];
            avatarUrl?: string;
            requireApproval?: boolean;
      }) => {
            if (!socket) return;

            return new Promise<{ group: Conversation }>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_CREATE,
                        dto,
                        (response: SocketAck<{ group: Conversation }>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    // Unwrap WsTransformInterceptor envelope
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      // Emit: Update Group
      const updateGroup = useCallback((conversationId: string, updates: {
            name?: string;
            avatarUrl?: string;
            requireApproval?: boolean;
      }) => {
            if (!socket) return;

            return new Promise<{ updated: unknown }>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_UPDATE,
                        { conversationId, updates },
                        (response: SocketAck<{ updated: unknown }>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    // Unwrap WsTransformInterceptor envelope
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      // Emit: Leave Group
      const leaveGroup = useCallback((conversationId: string) => {
            if (!socket) return;

            return new Promise<boolean>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_LEAVE,
                        { conversationId },
                        (response: SocketAck<boolean>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    // Unwrap WsTransformInterceptor envelope
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      // Emit: Add Members to Group
      const addMembers = useCallback((conversationId: string, userIds: string[]) => {
            if (!socket) return;

            return new Promise<{ addedMemberIds: string[] }>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_ADD_MEMBERS,
                        { conversationId, userIds },
                        (response: SocketAck<{ addedMemberIds: string[] }>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      // Emit: Remove Member from Group
      const removeMember = useCallback((conversationId: string, userId: string) => {
            if (!socket) return;

            return new Promise<boolean>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_REMOVE_MEMBER,
                        { conversationId, userId },
                        (response: SocketAck<boolean>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      // Emit: Transfer Admin
      const transferAdmin = useCallback((conversationId: string, newAdminId: string) => {
            if (!socket) return;

            return new Promise<boolean>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_TRANSFER_ADMIN,
                        { conversationId, newAdminId },
                        (response: SocketAck<boolean>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      // Emit: Dissolve Group
      const dissolveGroup = useCallback((conversationId: string) => {
            if (!socket) return;

            return new Promise<boolean>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_DISSOLVE,
                        { conversationId },
                        (response: SocketAck<boolean>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      // Emit: Get Pending Join Requests
      const getPendingRequests = useCallback((conversationId: string) => {
            if (!socket) return;

            return new Promise<unknown[]>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_GET_PENDING,
                        { conversationId },
                        (response: SocketAck<unknown[]>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      // Emit: Review Join Request
      const reviewJoinRequest = useCallback((requestId: string, approve: boolean) => {
            if (!socket) return;

            return new Promise<{ success: boolean; status?: string; alreadyMember?: boolean; message?: string }>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_REVIEW_JOIN,
                        { requestId, approve },
                        (response: SocketAck<{ success: boolean; status?: string; alreadyMember?: boolean; message?: string }>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      // Emit: Invite Members (non-admin with requireApproval → creates join requests)
      const inviteMembers = useCallback((conversationId: string, userIds: string[]) => {
            if (!socket) return;

            return new Promise<{ result: { invitedCount: number; skippedCount: number } }>((resolve, reject) => {
                  socket.emit(
                        SocketEvents.GROUP_INVITE_MEMBERS,
                        { conversationId, userIds },
                        (response: SocketAck<{ result: { invitedCount: number; skippedCount: number } }>) => {
                              if ('error' in response) {
                                    reject(new Error(response.error));
                              } else {
                                    resolve(response.data);
                              }
                        }
                  );
            });
      }, [socket]);

      return {
            isConnected,
            // Emitters
            createGroup,
            updateGroup,
            leaveGroup,
            addMembers,
            removeMember,
            transferAdmin,
            dissolveGroup,
            getPendingRequests,
            reviewJoinRequest,
            inviteMembers,
      };
}
