// src/hooks/use-conversation-socket.ts
import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from './use-socket';
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

type SocketAck<T> = ({ error?: undefined } & T) | { error: string };

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

            // Register all listeners
            socket.on(SocketEvents.GROUP_CREATED, onGroupCreated);
            socket.on(SocketEvents.GROUP_UPDATED, onGroupUpdated);
            socket.on(SocketEvents.GROUP_MEMBERS_ADDED, onGroupMembersAdded);
            socket.on(SocketEvents.GROUP_MEMBER_REMOVED, onGroupMemberRemoved);
            socket.on(SocketEvents.GROUP_MEMBER_LEFT, onGroupMemberLeft);
            socket.on(SocketEvents.GROUP_DISSOLVED, onGroupDissolved);
            socket.on(SocketEvents.GROUP_YOU_WERE_REMOVED, onGroupYouWereRemoved);
            socket.on(SocketEvents.GROUP_MEMBER_JOINED, onGroupMemberJoined);

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
            };
      }, [socket, isConnected]); //  Only depend on socket & isConnected

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
                                    resolve(response);
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
                                    resolve(response);
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
                                    resolve(response);
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
      };
}