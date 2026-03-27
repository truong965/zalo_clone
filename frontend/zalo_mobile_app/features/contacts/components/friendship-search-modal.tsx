import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Keyboard, TouchableOpacity } from 'react-native';
import { Modal, Portal, Button, Text, ActivityIndicator, IconButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SearchBar } from '@/components/ui/search-bar';
import { useSearch } from '@/features/search/hooks/use-search';
import { mobileApi, ApiRequestError } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';
import { useSendFriendRequest, useCancelRequest, useAcceptRequest } from '@/features/friendship/api/friendship.api';
import type { ContactSearchResult } from '@/features/search/types';
import { UserAvatar } from '@/components/ui/user-avatar';

interface FriendRequestModalProps {
      visible: boolean;
      onClose: () => void;
      onAfterAction?: () => void;
      target: { userId: string; displayName: string; avatarUrl?: string };
}

function FriendRequestModal({ visible, onClose, onAfterAction, target }: FriendRequestModalProps) {
      const sendRequest = useSendFriendRequest();

      const handleSend = () => {
            sendRequest.mutate(target.userId, {
                  onSuccess: () => {
                        Toast.show({
                              type: 'success',
                              text1: 'Thành công',
                              text2: `Đã gửi yêu cầu kết bạn tới ${target.displayName}`,
                        });
                        onAfterAction?.();
                  },
                  onError: (error: any) => {
                        const message = error instanceof ApiRequestError && error.status === 409
                              ? 'Yêu cầu kết bạn đã tồn tại hoặc đang chờ'
                              : error?.message || 'Không thể gửi yêu cầu kết bạn';

                        Toast.show({
                              type: 'error',
                              text1: 'Lỗi',
                              text2: message,
                        });
                        onAfterAction?.();
                  }
            });
      };

      return (
            <Portal>
                  <Modal visible={visible} onDismiss={onClose} contentContainerStyle={{ backgroundColor: 'white', padding: 20, margin: 20, borderRadius: 8 }}>
                        <Text variant="titleMedium" className="mb-4">
                              Kết bạn: {target.displayName}
                        </Text>
                        <Text variant="bodyMedium" className="mb-4 text-gray-600">
                              Người này chặn nhận tin nhắn từ người lạ. Bạn cần gửi yêu cầu kết bạn để nhắn tin.
                        </Text>
                        <View className="flex-row justify-end mt-4">
                              <Button onPress={onClose} className="mr-2">Hủy</Button>
                              <Button mode="contained" onPress={handleSend} loading={sendRequest.isPending}>
                                    Kết bạn
                              </Button>
                        </View>
                  </Modal>
            </Portal>
      );
}

export function FriendshipSearchModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
      const router = useRouter();
      const { accessToken } = useAuth();
      const [phoneInput, setPhoneInput] = useState('');
      const [validationError, setValidationError] = useState<string | null>(null);
      const [isActionLoading, setIsActionLoading] = useState(false);
      const [showFriendRequestModal, setShowFriendRequestModal] = useState(false);

      const {
            keyword,
            results,
            status,
            errorMessage,
            handleKeywordChange,
            triggerSearch,
            resetSearch,
            setSearchType,
      } = useSearch({ autoSubscribe: false, store: 'friend' });

      useEffect(() => {
            setSearchType('CONTACT');
      }, [setSearchType]);

      useEffect(() => {
            if (!visible) {
                  setPhoneInput('');
                  setValidationError(null);
                  resetSearch();
                  setShowFriendRequestModal(false);
            }
      }, [visible, resetSearch]);

      const normalizedInput = useMemo(() => phoneInput.replace(/\s+/g, ''), [phoneInput]);
      const contact = (results?.contacts?.[0] as ContactSearchResult | undefined) ?? undefined;

      const sendRequest = useSendFriendRequest();
      const cancelReq = useCancelRequest();
      const acceptReq = useAcceptRequest();

      const handleSearch = useCallback(() => {
            Keyboard.dismiss();
            const PHONE_PATTERN = /^(0\d{9}|\+84\d{9})$/;
            if (!normalizedInput) {
                  setValidationError('Số điện thoại không được để trống');
                  resetSearch();
                  return;
            }
            if (!PHONE_PATTERN.test(normalizedInput)) {
                  setValidationError('Số điện thoại không đúng định dạng');
                  resetSearch();
                  return;
            }

            setValidationError(null);
            handleKeywordChange(normalizedInput);
            triggerSearch(normalizedInput);
      }, [handleKeywordChange, normalizedInput, resetSearch, triggerSearch]);

      const executeNavigation = useCallback(async () => {
            if (!contact || !accessToken) return;
            if (isActionLoading) return;
            setIsActionLoading(true);
            try {
                  const conversationId = contact.existingConversationId
                        ? contact.existingConversationId
                        : (await mobileApi.getOrCreateDirectConversation(contact.id, accessToken)).id;

                  onClose();
                  router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
            } finally {
                  setIsActionLoading(false);
            }
      }, [contact, isActionLoading, onClose, router, accessToken]);

      const handleMessageClick = useCallback(() => {
            if (!contact) return;
            if (contact.relationshipStatus === 'FRIEND') {
                  executeNavigation();
                  return;
            }
            if (contact.relationshipStatus === 'BLOCKED') {
                  return;
            }
            if (contact.relationshipStatus === 'REQUEST' && contact.requestDirection === 'INCOMING') {
                  executeNavigation();
                  return;
            }
            if (contact.canMessage === false) {
                  setShowFriendRequestModal(true);
            } else {
                  executeNavigation();
            }
      }, [contact, executeNavigation]);

      const effectiveDisplayName = contact?.relationshipStatus === 'FRIEND'
            ? (contact.displayNameFinal || contact.displayName)
            : contact?.displayName ?? '';

      return (
            <Portal>
                  <Modal visible={visible} onDismiss={onClose} contentContainerStyle={{ backgroundColor: 'white', padding: 20, margin: 20, borderRadius: 12 }}>
                        <View className="flex-row justify-between items-center mb-4">
                              <Text variant="titleMedium" className="font-bold">Thêm bạn</Text>
                              <IconButton icon="close" size={20} onPress={onClose} className="m-0 p-0" />
                        </View>

                        <View className="mb-2">
                              <SearchBar
                                    value={phoneInput}
                                    onChangeText={setPhoneInput}
                                    placeholder="Nhập số điện thoại"
                                    keyboardType="phone-pad"
                                    containerClass="p-0"
                                    autoFocus
                              />
                              <Button
                                    mode="contained"
                                    onPress={handleSearch}
                                    className="mt-3 h-11 justify-center rounded-md"
                                    disabled={status === 'loading'}
                                    loading={status === 'loading'}
                              >
                                    <Text className="font-medium">Tìm kiếm</Text>
                              </Button>
                        </View>

                        {validationError && (
                              <Text className="text-red-500 mb-4">{validationError}</Text>
                        )}
                        {errorMessage && status === 'error' && (
                              <Text className="text-red-500 mb-4">{errorMessage}</Text>
                        )}

                        {status === 'loading' && (
                              <ActivityIndicator className="my-6" size="large" />
                        )}

                        {status === 'success' && !contact && keyword.trim() ? (
                              <Text className="text-center text-gray-500 my-6">Không tìm thấy người dùng nào</Text>
                        ) : null}

                        {status === 'success' && contact && (
                              <View className="border border-gray-200 rounded-xl p-4 mt-4 bg-gray-50">
                                    <View className="flex-row items-center mb-4">
                                          <UserAvatar uri={contact.avatarUrl} size={56} />
                                          <View className="ml-3 flex-1">
                                                <Text variant="titleMedium" numberOfLines={1} className="font-semibold">{effectiveDisplayName}</Text>
                                                {contact.phoneNumber && <Text variant="bodySmall" className="text-gray-500">{contact.phoneNumber}</Text>}
                                          </View>
                                    </View>

                                    {contact.relationshipStatus === 'REQUEST' && (
                                          <Text variant="bodyMedium" className="text-blue-600 mb-3 text-center font-medium">
                                                {contact.requestDirection === 'INCOMING' ? 'Bạn có lời mời kết bạn' : 'Bạn đã gửi lời mời'}
                                          </Text>
                                    )}

                                    <View className="flex-row items-center">
                                          {contact.relationshipStatus === 'BLOCKED' ? (
                                                <Button mode="contained-tonal" disabled className="flex-1 bg-gray-200">
                                                      Đã chặn
                                                </Button>
                                          ) : (
                                                <>
                                                      <Button mode="contained" className="flex-1 mr-2 rounded-lg" loading={isActionLoading} onPress={handleMessageClick}>
                                                            Nhắn tin
                                                      </Button>
                                                      {contact.relationshipStatus === 'FRIEND' ? (
                                                            <Button mode="contained-tonal" disabled className="flex-1 bg-gray-200 rounded-lg">
                                                                  Đã là bạn bè
                                                            </Button>
                                                      ) : contact.relationshipStatus === 'REQUEST' ? (
                                                            contact.requestDirection === 'OUTGOING' ? (
                                                                  <Button
                                                                        mode="outlined"
                                                                        className="flex-1 rounded-lg"
                                                                        loading={cancelReq.isPending}
                                                                        onPress={() => cancelReq.mutate(contact.pendingRequestId!, {
                                                                              onSuccess: () => {
                                                                                    Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã hủy yêu cầu kết bạn' });
                                                                                    onClose();
                                                                              },
                                                                              onError: (error: any) => {
                                                                                    Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể hủy yêu cầu kết bạn' });
                                                                                    onClose();
                                                                              }
                                                                        })}
                                                                  >
                                                                        Hủy yêu cầu
                                                                  </Button>
                                                            ) : (
                                                                  <Button
                                                                        mode="contained-tonal"
                                                                        className="flex-1 bg-blue-100 text-blue-800 rounded-lg"
                                                                        loading={acceptReq.isPending}
                                                                        onPress={() => acceptReq.mutate(contact.pendingRequestId!, {
                                                                              onSuccess: () => {
                                                                                    Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã chấp nhận kết bạn' });
                                                                                    onClose();
                                                                              },
                                                                              onError: (error: any) => {
                                                                                    Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể chấp nhận kết bạn' });
                                                                                    onClose();
                                                                              }
                                                                        })}
                                                                  >
                                                                        Chấp nhận
                                                                  </Button>
                                                            )
                                                      ) : (
                                                            <Button
                                                                  mode="contained-tonal"
                                                                  className="flex-1 bg-blue-100 text-blue-800 rounded-lg"
                                                                  loading={sendRequest.isPending}
                                                                  onPress={() => sendRequest.mutate(contact.id, {
                                                                        onSuccess: () => {
                                                                              Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã gửi yêu cầu kết bạn' });
                                                                              onClose();
                                                                        },
                                                                        onError: (error: any) => {
                                                                              const message = error instanceof ApiRequestError && error.status === 409
                                                                                    ? 'Yêu cầu kết bạn đã tồn tại hoặc đang chờ'
                                                                                    : error?.message || 'Không thể gửi yêu cầu kết bạn';

                                                                              Toast.show({ type: 'error', text1: 'Lỗi', text2: message });
                                                                              onClose();
                                                                        }
                                                                  })}
                                                            >
                                                                  Kết bạn
                                                            </Button>
                                                      )}
                                                </>
                                          )}
                                    </View>
                              </View>
                        )}
                  </Modal>

                  {/* Trạng thái Privacy chặn người lạ nhắn tin */}
                  {contact && showFriendRequestModal && (
                        <FriendRequestModal
                              visible={showFriendRequestModal}
                              onClose={() => setShowFriendRequestModal(false)}
                              onAfterAction={() => {
                                    setShowFriendRequestModal(false);
                                    onClose(); // Close parent on action/error as requested
                              }}
                              target={{
                                    userId: contact!.id,
                                    displayName: effectiveDisplayName,
                                    avatarUrl: contact!.avatarUrl,
                              }}
                        />
                  )}
            </Portal>
      );
}
