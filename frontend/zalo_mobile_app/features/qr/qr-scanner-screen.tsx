import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/providers/auth-provider';
import { ApiRequestError, mobileApi } from '@/services/api';
import type { QrScanResponse } from '@/types/auth';

function extractQrSessionId(rawValue: string): string | null {
      const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

      const directMatch = rawValue.match(uuidRegex);
      if (directMatch) {
            return directMatch[0];
      }

      try {
            const parsed = new URL(rawValue);
            const session = parsed.searchParams.get('session');

            if (!session) {
                  return null;
            }

            const sessionMatch = session.match(uuidRegex);
            return sessionMatch ? sessionMatch[0] : null;
      } catch {
            return null;
      }
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
      const [qrSessionId, setQrSessionId] = useState<string | null>(null);
      const [hasScanned, setHasScanned] = useState(false);

      const canScan = useMemo(() => {
            return Boolean(permission?.granted) && !isProcessing && !hasScanned;
      }, [hasScanned, isProcessing, permission?.granted]);

      if (!isAuthenticated || !accessToken) {
            return <Redirect href={loginHref} />;
      }

      if (!permission) {
            return (
                  <SafeAreaView className="flex-1 items-center justify-center gap-3 px-4 py-3" edges={['top', 'bottom']}>
                        <ActivityIndicator />
                  </SafeAreaView>
            );
      }

      if (!permission.granted) {
            return (
                  <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-background px-4 py-3" edges={['top', 'bottom']}>
                        <Text className="text-center text-xl font-bold text-foreground">{t('qr.cameraPermissionTitle')}</Text>
                        <Text className="text-center text-muted">{t('qr.cameraPermissionSubtitle')}</Text>
                        <Pressable className="mt-1 rounded-xl bg-primary px-5 py-3" onPress={requestPermission}>
                              <Text className="font-bold text-primary-foreground">{t('qr.grantCameraPermission')}</Text>
                        </Pressable>
                  </SafeAreaView>
            );
      }

      const onScanned = async (data: string) => {
            if (!canScan) {
                  return;
            }

            const session = extractQrSessionId(data);
            if (!session) {
                  Alert.alert(t('qr.invalidQrTitle'), t('qr.invalidQrMessage'));
                  return;
            }

            setIsProcessing(true);
            setHasScanned(true);
            setQrSessionId(session);
            setScanResult(null);

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
            setQrSessionId(null);
      };

      return (
            <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
                  <View className="mx-4 mb-1.5 mt-2.5 flex-1 overflow-hidden rounded-2xl border border-border">
                        <CameraView
                              style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
                              facing="back"
                              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                              onBarcodeScanned={canScan ? ({ data }) => void onScanned(data) : undefined}
                        />
                        <View className="mt-[30%] h-[220px] w-[220px] self-center rounded-2xl border-2 border-primary bg-transparent" />
                  </View>

                  <View
                        className="gap-2 px-4"
                        style={{
                              paddingTop: Math.max(insets.top, 6),
                              paddingBottom: Math.max(insets.bottom, 8) + 8,
                        }}>
                        <Text className="text-xl font-bold text-foreground">{t('qr.scanTitle')}</Text>
                        <Text className="text-muted">{t('qr.scanSubtitle')}</Text>

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

                        <Pressable className="mt-2 items-center rounded-xl border border-border py-2.5" onPress={resetScanner}>
                              <Text className="font-bold text-muted">{t('qr.scanAnother')}</Text>
                        </Pressable>
                  </View>
            </SafeAreaView>
      );
}
