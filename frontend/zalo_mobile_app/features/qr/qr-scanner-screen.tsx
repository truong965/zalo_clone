import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/providers/auth-provider';
import { ApiRequestError, mobileApi } from '@/services/api';
import type { QrScanResponse } from '@/types/auth';
import type { JoinGroupPreviewResponse } from '@/types/conversation';

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

type ParsedQrPayload =
      | {
            type: 'LOGIN_QR';
            qrSessionId: string;
      }
      | {
            type: 'GROUP_JOIN';
            conversationId: string;
            groupName?: string;
            memberCount?: number;
      };

function extractLoginQrSessionId(rawValue: string): string | null {
      const directMatch = rawValue.match(UUID_REGEX);
      if (directMatch) {
            return directMatch[0];
      }

      try {
            const parsed = new URL(rawValue);
            const session = parsed.searchParams.get('session');

            if (!session) {
                  return null;
            }

            const sessionMatch = session.match(UUID_REGEX);
            return sessionMatch ? sessionMatch[0] : null;
      } catch {
            return null;
      }
}

function extractGroupJoinConversationId(rawValue: string): string | null {
      try {
            const parsed = JSON.parse(rawValue) as {
                  type?: unknown;
                  conversationId?: unknown;
            };

            if (
                  parsed.type !== 'GROUP_JOIN' ||
                  typeof parsed.conversationId !== 'string'
            ) {
                  return null;
            }

            const match = parsed.conversationId.match(UUID_REGEX);
            return match ? match[0] : null;
      } catch {
            return null;
      }
}

function extractGroupJoinPayload(rawValue: string): Extract<ParsedQrPayload, { type: 'GROUP_JOIN' }> | null {
      try {
            const parsed = JSON.parse(rawValue) as {
                  type?: unknown;
                  conversationId?: unknown;
                  name?: unknown;
                  memberCount?: unknown;
            };

            if (parsed.type !== 'GROUP_JOIN' || typeof parsed.conversationId !== 'string') {
                  return null;
            }

            const conversationIdMatch = parsed.conversationId.match(UUID_REGEX);
            if (!conversationIdMatch) {
                  return null;
            }

            return {
                  type: 'GROUP_JOIN',
                  conversationId: conversationIdMatch[0],
                  groupName: typeof parsed.name === 'string' ? parsed.name : undefined,
                  memberCount: typeof parsed.memberCount === 'number' ? parsed.memberCount : undefined,
            };
      } catch {
            return null;
      }
}

function parseQrPayload(rawValue: string): ParsedQrPayload | null {
      const groupJoinPayload = extractGroupJoinPayload(rawValue);
      if (groupJoinPayload) {
            return groupJoinPayload;
      }

      const conversationId = extractGroupJoinConversationId(rawValue);
      if (conversationId) {
            return {
                  type: 'GROUP_JOIN',
                  conversationId,
                  groupName: undefined,
                  memberCount: undefined,
            };
      }

      const qrSessionId = extractLoginQrSessionId(rawValue);
      if (qrSessionId) {
            return {
                  type: 'LOGIN_QR',
                  qrSessionId,
            };
      }

      return null;
}

function getGroupInitials(groupName: string): string {
      const safeName = groupName.trim();
      if (!safeName) {
            return 'N';
      }

      const words = safeName.split(/\s+/).filter(Boolean);
      if (words.length === 1) {
            return words[0].slice(0, 2).toUpperCase();
      }

      return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function QrScannerScreen() {
      const { accessToken, isAuthenticated } = useAuth();
      const router = useRouter();
      const { t } = useTranslation();
      const loginHref = '/login' as Href;
      const [permission, requestPermission] = useCameraPermissions();
      const insets = useSafeAreaInsets();

      const [isProcessing, setIsProcessing] = useState(false);
      const [scanResult, setScanResult] = useState<QrScanResponse | null>(null);
      const [groupPreview, setGroupPreview] = useState<JoinGroupPreviewResponse | null>(null);
      const [qrSessionId, setQrSessionId] = useState<string | null>(null);
      const [hasScanned, setHasScanned] = useState(false);

      // When group QR is scanned, unmount camera to stop preview and focus on confirmation UI.
      const shouldHideCamera = hasScanned && qrSessionId === null;
      const groupTitle = groupPreview?.name || t('qr.unknownGroup', 'Nhóm không xác định');
      const groupMembersText = `${groupPreview?.memberCount ?? 0} ${t('qr.groupMembersSuffix', 'thành viên')}`;
      const groupJoinActionText = groupPreview?.isMember
            ? t('qr.alreadyMemberOpenChat', 'Mở cuộc trò chuyện')
            : groupPreview?.requireApproval
                  ? t('qr.sendJoinRequest', 'Gửi yêu cầu tham gia')
                  : t('qr.joinNow', 'Tham gia');

      const canScan = useMemo(() => {
            return Boolean(permission?.granted) && !isProcessing && !hasScanned;
      }, [hasScanned, isProcessing, permission?.granted]);

      if (!isAuthenticated || !accessToken) {
            return <Redirect href={loginHref} />;
      }

      if (!permission) {
            return (
                  <View className="flex-1 items-center justify-center gap-3 px-4 py-3">
                        <ActivityIndicator />
                  </View>
            );
      }

      if (!permission.granted) {
            return (
                  <View className="flex-1 items-center justify-center gap-3 bg-background px-4 py-3">
                        <Text className="text-center text-xl font-bold text-foreground">{t('qr.cameraPermissionTitle')}</Text>
                        <Text className="text-center text-muted">{t('qr.cameraPermissionSubtitle')}</Text>
                        <Pressable className="mt-1 rounded-xl bg-primary px-5 py-3" onPress={requestPermission}>
                              <Text className="font-bold text-primary-foreground">{t('qr.grantCameraPermission')}</Text>
                        </Pressable>
                  </View>
            );
      }

      const onScanned = async (data: string) => {
            if (!canScan) {
                  return;
            }

            const payload = parseQrPayload(data);
            if (!payload) {
                  Alert.alert(t('qr.invalidQrTitle'), t('qr.unsupportedQrMessage'));
                  return;
            }

            setIsProcessing(true);
            setHasScanned(true);
            setQrSessionId(null);
            setScanResult(null);
            setGroupPreview(null);

            if (payload.type === 'GROUP_JOIN') {
                  try {
                        const preview = await mobileApi.getJoinGroupPreview(
                              payload.conversationId,
                              accessToken,
                        );
                        setGroupPreview(preview);
                  } catch (error) {
                        // Fallback to QR payload data for basic display when preview API fails.
                        if (
                              payload.groupName &&
                              typeof payload.memberCount === 'number'
                        ) {
                              setGroupPreview({
                                    conversationId: payload.conversationId,
                                    name: payload.groupName,
                                    memberCount: payload.memberCount,
                                    avatarUrl: null,
                                    requireApproval: true,
                                    isMember: false,
                              });
                        } else {
                              const message =
                                    error instanceof Error
                                          ? error.message
                                          : t('qr.groupJoinFailed');
                              Alert.alert(t('qr.scanErrorTitle'), message);
                              setHasScanned(false);
                              setQrSessionId(null);
                        }
                  } finally {
                        setIsProcessing(false);
                  }

                  return;
            }

            const session = payload.qrSessionId;
            setQrSessionId(session);

            try {
                  const result = await mobileApi.scanQr(session, accessToken);
                  setScanResult(result);
                  setIsProcessing(false);

                  if (!result.requireConfirm) {
                        router.back();
                        return;
                  }
            } catch (error) {
                  if (error instanceof ApiRequestError && error.status === 400) {
                        let statusText = '';

                        try {
                              const status = await mobileApi.getQrStatus(session);
                              if (status.status === 'EXPIRED') {
                                    statusText = t('qr.expiredHint');
                              }
                        } catch {
                              // Best effort check only.
                        }

                        Alert.alert(
                              t('qr.invalidQrTitle'),
                              t('qr.invalidOrExpiredMessage', {
                                    statusText,
                              }),
                        );
                  } else {
                        const message = error instanceof Error ? error.message : t('qr.scanErrorFallback');
                        Alert.alert(t('qr.scanErrorTitle'), message);
                  }

                  setIsProcessing(false);
                  setHasScanned(false);
            }
      };

      const onConfirmJoinGroup = async () => {
            if (!groupPreview) {
                  return;
            }

            if (groupPreview.isMember) {
                  router.replace({ pathname: '/chat/[id]', params: { id: groupPreview.conversationId } } as any);
                  return;
            }

            setIsProcessing(true);

            try {
                  const result = await mobileApi.requestJoinGroup(groupPreview.conversationId, accessToken);

                  if (result.status === 'APPROVED') {
                        router.replace({ pathname: '/chat/[id]', params: { id: groupPreview.conversationId } } as any);
                        return;
                  }

                  Alert.alert(t('common.success', 'Thành công'), t('qr.groupJoinPending', 'Yêu cầu gia nhập nhóm thành công. Vui lòng chờ quản trị viên duyệt.'));
                  setHasScanned(false);
                  setGroupPreview(null);
                  setQrSessionId(null);
            } catch (error) {
                  const message = error instanceof Error ? error.message : t('qr.groupJoinFailed', 'Không thể gửi yêu cầu gia nhập nhóm.');
                  Alert.alert(t('qr.scanErrorTitle'), message);
            } finally {
                  setIsProcessing(false);
            }
      };

      const onConfirm = async () => {
            if (!qrSessionId) {
                  return;
            }

            setIsProcessing(true);
            try {
                  await mobileApi.confirmQr(qrSessionId, accessToken);
                  router.back();
                  return;
            } catch (error) {
                  const message = error instanceof Error ? error.message : t('qr.confirmFailed');
                  Alert.alert(t('common.error'), message);
            } finally {
                  setIsProcessing(false);
            }
      };

      const resetScanner = async () => {
            if (qrSessionId && accessToken) {
                  try {
                        await mobileApi.cancelQr(qrSessionId, accessToken);
                  } catch {
                        // Best effort — ignore errors (session may already be expired)
                  }
            }
            setHasScanned(false);
            setIsProcessing(false);
            setScanResult(null);
            setGroupPreview(null);
            setQrSessionId(null);
      };

      if (shouldHideCamera) {
            return (
                  <View className="flex-1 bg-black/70 justify-end">
                        <View
                              className="rounded-t-[28px] bg-[#1f1f1f]"
                              style={{
                                    height: '74%',
                                    paddingBottom: Math.max(insets.bottom, 10) + 10,
                              }}
                        >
                              <View className="items-center pt-2 pb-3">
                                    <View className="h-1.5 w-14 rounded-full bg-[#5b5b5d]" />
                              </View>

                              <View className="flex-row items-center px-4 pb-3 border-b border-[#2f2f32]">
                                    <Pressable className="h-9 w-9 items-center justify-center" onPress={() => void resetScanner()}>
                                          <Text className="text-3xl leading-none text-[#f4f4f5]">×</Text>
                                    </Pressable>

                                    <Text className="flex-1 text-center text-xl font-semibold text-[#f4f4f5]">
                                          {t('qr.communityInfoTitle', 'Thông tin cộng đồng')}
                                    </Text>

                                    <View className="h-9 w-9 items-center justify-center">
                                          <Text className="text-2xl text-[#f4f4f5]">⋯</Text>
                                    </View>
                              </View>

                              <View className="flex-1 px-6 pt-6 items-center">
                                    {isProcessing && !groupPreview ? (
                                          <>
                                                <ActivityIndicator />
                                                <Text className="mt-3 text-base text-[#b7b7ba] text-center">
                                                      {t('qr.loadingGroupInfo', 'Đang tải thông tin nhóm...')}
                                                </Text>
                                          </>
                                    ) : (
                                          <>
                                                {groupPreview?.avatarUrl ? (
                                                      <Image
                                                            source={{ uri: groupPreview.avatarUrl }}
                                                            className="h-24 w-24 rounded-full"
                                                            resizeMode="cover"
                                                      />
                                                ) : (
                                                      <View className="h-24 w-24 rounded-full bg-[#dce9ff] items-center justify-center">
                                                            <Text className="text-2xl font-bold text-[#175fe6]">
                                                                  {getGroupInitials(groupTitle)}
                                                            </Text>
                                                      </View>
                                                )}

                                                <Text className="mt-5 text-center text-[32px] font-semibold text-white" numberOfLines={2}>
                                                      {groupTitle}
                                                </Text>

                                                <Text className="mt-2 text-lg text-[#c0c2c9]">
                                                      {groupMembersText}
                                                </Text>

                                                <Text className="mt-3 text-sm text-[#98a7c3] text-center">
                                                      {groupPreview?.requireApproval
                                                            ? t('qr.groupRequireApprovalHint', 'Nhóm này yêu cầu quản trị viên duyệt trước khi vào cuộc trò chuyện.')
                                                            : t('qr.groupOpenHint', 'Nhấn Tham gia để vào nhóm ngay.')}
                                                </Text>
                                          </>
                                    )}
                              </View>

                              <View className="px-6 pt-4">
                                    <Pressable
                                          className="items-center rounded-full bg-[#1677ff] py-4"
                                          onPress={onConfirmJoinGroup}
                                          disabled={isProcessing || !groupPreview}
                                    >
                                          <Text className="text-xl font-semibold text-white">
                                                {isProcessing ? t('common.loading') : groupJoinActionText}
                                          </Text>
                                    </Pressable>
                              </View>
                        </View>
                  </View>
            );
      }

      return (
            <View className="flex-1 bg-background">
                  <View className="mx-4 mb-1.5 mt-2.5 flex-1 overflow-hidden rounded-2xl border border-border">
                        {shouldHideCamera ? (
                              <View className="flex-1 items-center justify-center bg-[#eef5ff] px-5">
                                    {isProcessing && !groupPreview ? (
                                          <>
                                                <ActivityIndicator />
                                                <Text className="mt-2 text-sm text-muted text-center">
                                                      {t('qr.loadingGroupInfo', 'Đang tải thông tin nhóm...')}
                                                </Text>
                                          </>
                                    ) : groupPreview ? (
                                          <>
                                                {groupPreview.avatarUrl ? (
                                                      <Image
                                                            source={{ uri: groupPreview.avatarUrl }}
                                                            className="h-20 w-20 rounded-[28px]"
                                                            resizeMode="cover"
                                                      />
                                                ) : (
                                                      <View className="h-20 w-20 rounded-[28px] bg-[#d8e8ff] items-center justify-center">
                                                            <Text className="text-xl font-bold text-[#1d4ed8]">
                                                                  {getGroupInitials(groupTitle)}
                                                            </Text>
                                                      </View>
                                                )}

                                                <Text className="mt-3 text-lg font-semibold text-foreground text-center" numberOfLines={2}>
                                                      {groupTitle}
                                                </Text>
                                                <Text className="mt-1 text-sm text-muted">{groupMembersText}</Text>
                                          </>
                                    ) : (
                                          <Text className="text-sm text-muted text-center">
                                                {t('qr.groupPreviewTitle', 'Thông tin nhóm')}
                                          </Text>
                                    )}
                              </View>
                        ) : (
                              <>
                                    <CameraView
                                          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                                          facing="back"
                                          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                                          onBarcodeScanned={canScan ? ({ data }) => void onScanned(data) : undefined}
                                    />
                                    <View className="mt-[30%] h-[220px] w-[220px] self-center rounded-2xl border-2 border-primary bg-transparent" />
                              </>
                        )}
                  </View>

                  <View
                        className="gap-2 px-4"
                        style={{
                              paddingTop: 6,
                              paddingBottom: Math.max(insets.bottom, 8) + 8,
                        }}>
                        {scanResult?.requireConfirm ? (
                              <View className="mt-2 gap-1.5 rounded-xl border border-border bg-secondary p-3">
                                    <Text className="text-base font-bold text-foreground">{t('qr.confirmRequired')}</Text>
                                    <Text className="text-foreground">
                                          {t('qr.browser')}: {scanResult.browser ?? t('common.unknown')}
                                    </Text>
                                    <Text className="text-foreground">
                                          {t('qr.os')}: {scanResult.os ?? t('common.unknown')}
                                    </Text>
                                    <Text className="text-foreground">
                                          {t('qr.ip')}: {scanResult.ipAddress ?? t('common.unknown')}
                                    </Text>
                                    <Text className="text-foreground">
                                          {t('qr.createdAt')}: {scanResult.createdAt ?? t('common.unknown')}
                                    </Text>

                                    <Pressable className="mt-2 items-center rounded-xl bg-primary py-2.5" onPress={onConfirm} disabled={isProcessing}>
                                          <Text className="font-bold text-primary-foreground">
                                                {isProcessing ? t('common.loading') : t('qr.confirmLogin')}
                                          </Text>
                                    </Pressable>
                              </View>
                        ) : null}

                        <Pressable className="mt-2 items-center rounded-xl border border-border py-2.5" onPress={resetScanner} disabled={isProcessing}>
                              <Text className="font-bold text-muted">{t('qr.scanAnother')}</Text>
                        </Pressable>
                  </View>
            </View>
      );
}
