import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Divider } from 'react-native-paper';
import { cssInterop } from 'nativewind';

import { useAuth } from '@/providers/auth-provider';
import { ApiRequestError, mobileApi } from '@/services/api';
import type { DeviceSession } from '@/types/auth';

dayjs.extend(relativeTime);
dayjs.locale('vi');

// Manual base64 decode fallback for environments without atob
const base64Decode = (str: string): string => {
  try {
    if (typeof atob === 'function') return atob(str);
  } catch (e) {}

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  str = String(str).replace(/=+$/, '');
  for (
    let bc = 0, bs = 0, buffer, idx = 0;
    (buffer = str.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
};

const getDeviceIdFromToken = (token: string | null): string | null => {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = base64Decode(base64);
    const data = JSON.parse(decoded);
    return data.deviceId;
  } catch (e) {
    return null;
  }
};

const getPlatformIcon = (item: DeviceSession): { name: keyof typeof MaterialCommunityIcons.glyphMap, color: string, bgColor: string } => {
  const p = item.platform?.toUpperCase() || '';
  const type = item.deviceType?.toUpperCase() || '';

  if (type === 'MOBILE' || p.includes('IOS') || p.includes('ANDROID')) {
    return { name: 'cellphone', color: '#10b981', bgColor: '#ecfdf5' };
  }
  if (type === 'DESKTOP' || p.includes('WINDOWS') || p.includes('MACOS')) {
    return { name: 'laptop', color: '#6366f1', bgColor: '#eef2ff' };
  }
  return { name: 'devices', color: '#94a3b8', bgColor: '#f1f5f9' };
};

const formatDate = (dateString?: string | Date) => {
  if (!dateString) return 'Không rõ';
  try {
    return dayjs(dateString).format('HH:mm, DD/MM/YYYY');
  } catch {
    return 'Không rõ';
  }
};

const StyledFlashList = cssInterop(FlashList, {
  className: 'style',
  contentContainerClassName: 'contentContainerStyle',
}) as any;

export default function DevicesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { accessToken, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [detailDevice, setDetailDevice] = useState<DeviceSession | null>(null);

  const currentDeviceId = useMemo(() => getDeviceIdFromToken(accessToken), [accessToken]);

  const handleSessionRevoked = useCallback(async () => {
    await logout();
    router.replace('/login');
  }, [logout, router]);

  const loadDeviceSessions = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const response = await mobileApi.getSessions(accessToken);
      const sessionList = response.sessions || [];

      const sorted = [...sessionList].sort((a, b) => {
        if (a.deviceId === currentDeviceId) return -1;
        if (b.deviceId === currentDeviceId) return 1;
        const timeA = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const timeB = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return timeB - timeA;
      });

      setDevices(sorted);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        await handleSessionRevoked();
        return;
      }
      setDevices([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, handleSessionRevoked, currentDeviceId]);

  useEffect(() => {
    // Initial load
    loadDeviceSessions();

    // Re-load on focus (equivalent to useFocusEffect)
    const unsubscribe = navigation.addListener('focus', () => {
      loadDeviceSessions();
    });

    return unsubscribe;
  }, [navigation, loadDeviceSessions]);

  const onForceLogoutDevice = async (session: DeviceSession) => {
    if (!accessToken) return;
    const isThisDevice = session.deviceId === currentDeviceId;

    Alert.alert(
      isThisDevice ? 'Đăng xuất' : 'Đăng xuất thiết bị',
      isThisDevice
        ? 'Bạn có chắc chắn muốn đăng xuất khỏi ứng dụng trên thiết bị này?'
        : `Bạn có chắc chắn muốn đăng xuất khỏi ${session.deviceName}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                if (isThisDevice) {
                  await logout();
                  router.replace('/login');
                  return;
                }
                await mobileApi.revokeSession(session.deviceId, accessToken);
                setDetailDevice(null);
                await loadDeviceSessions();
                Alert.alert('Thành công', 'Đã đăng xuất thiết bị');
              } catch (error) {
                if (error instanceof ApiRequestError && error.status === 401) {
                  await handleSessionRevoked();
                  return;
                }
                Alert.alert('Lỗi', 'Không thể đăng xuất thiết bị');
              }
            })();
          },
        },
      ]
    );
  };

  const renderDeviceItem = ({ item }: { item: DeviceSession }) => {
    const isThisDevice = item.deviceId === currentDeviceId;
    const { name: iconName, color: iconColor, bgColor: iconBgColor } = getPlatformIcon(item);
    const osInfo = [item.osName, item.osVersion].filter(Boolean).join(' ');
    const browserInfo = [item.browserName, item.browserVersion].filter(Boolean).join(' ');

    return (
      <Pressable
        onPress={() => setDetailDevice(item)}
        style={[
          styles.deviceItem,
          { backgroundColor: isThisDevice ? 'rgba(99, 102, 241, 0.05)' : '#ffffff' }
        ]}
      >
        {isThisDevice && (
          <View style={styles.currentDeviceIndicator} />
        )}
        <View style={styles.deviceItemContent}>
          <View style={styles.iconContainer}>
            <View style={[styles.platformIcon, { backgroundColor: iconBgColor }]}>
              <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
            </View>
          </View>
          <View style={styles.deviceInfo}>
            <View style={styles.deviceHeader}>
              <Text style={styles.deviceName} numberOfLines={1}>{item.deviceName}</Text>
              {isThisDevice && (
                <View style={styles.thisDeviceBadge}>
                  <Text style={styles.badgeText}>THIẾT BỊ NÀY</Text>
                </View>
              )}
              {item.isOnline && (
                <View style={styles.activeBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>ACTIVE</Text>
                </View>
              )}
            </View>
            <View style={styles.osBrowserInfo}>
              <Text style={styles.osText}>{osInfo || item.platform || 'Không rõ'}</Text>
              {!!browserInfo && (
                <>
                  <Text style={styles.dotSeparator}>•</Text>
                  <View style={styles.browserContainer}>
                    <MaterialCommunityIcons name="earth" size={12} color="#94a3b8" />
                    <Text style={styles.browserText}>{browserInfo}</Text>
                  </View>
                </>
              )}
            </View>
            <View style={styles.locationContainer}>
              <View style={styles.locationBadge}>
                <MaterialCommunityIcons name="map-marker-outline" size={10} color="#6366f1" />
                <Text style={styles.locationText}>
                  {item.lastLocation || item.ipAddress || 'Không rõ vị trí'}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#cbd5e1" />
      </Pressable>
    );
  };


  return (
    <View style={styles.container}>
      {/* Custom Header to avoid potential Appbar navigation context issues */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#18181b" />
        </Pressable>
        <Text style={styles.headerTitle}>Quản lý thiết bị</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.mainContent}>
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>
              Dưới đây là danh sách các thiết bị đã đăng nhập vào tài khoản của bạn. 
              Bạn có thể đăng xuất từ xa nếu nhận thấy có hoạt động lạ.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>
            {t('device.activeSessions') || 'Các thiết bị đang đăng nhập'}
          </Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#6366f1" />
              <Text style={styles.loadingText}>Đang tải danh sách...</Text>
            </View>
          ) : (
            <View style={styles.listWrapper}>
              <StyledFlashList
                data={devices}
                keyExtractor={(item: DeviceSession) => item.deviceId}
                scrollEnabled={false}
                renderItem={renderDeviceItem}
                estimatedItemSize={100}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <MaterialCommunityIcons name="cellphone-off" size={48} color="#e2e8f0" />
                    <Text style={styles.emptyText}>Không tìm thấy thiết bị nào</Text>
                  </View>
                }

              />
            </View>
          )}

          <View style={styles.footerInfo}>
            <Text style={styles.footerInfoText}>
              Zalo bảo mật tài khoản của bạn bằng cách mã hóa các phiên đăng nhập và định danh phần cứng.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!detailDevice} transparent animationType="fade" onRequestClose={() => setDetailDevice(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDetailDevice(null)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {detailDevice && (
              <View>
                <View style={styles.modalHeader}>
                  <View style={[styles.modalIconContainer, { backgroundColor: getPlatformIcon(detailDevice).bgColor }]}>
                    <MaterialCommunityIcons name={getPlatformIcon(detailDevice).name} size={28} color={getPlatformIcon(detailDevice).color} />
                  </View>
                  <View style={styles.modalHeaderInfo}>
                    <Text style={styles.modalDeviceName}>{detailDevice.deviceName}</Text>
                    <Text style={styles.modalDeviceType}>{detailDevice.deviceType || 'UNKNOWN TYPE'}</Text>
                  </View>
                  <Pressable onPress={() => setDetailDevice(null)} style={styles.modalCloseButton}>
                    <MaterialCommunityIcons name="close" size={24} color="#71717a" />
                  </Pressable>
                </View>

                <ScrollView style={styles.modalScroll}>
                  <View style={styles.modalDetails}>
                    <View>
                      <View style={styles.detailSectionTitleContainer}>
                        <MaterialCommunityIcons name="information-outline" size={14} color="#6366f1" />
                        <Text style={styles.detailSectionTitle}>Thông tin hệ thống</Text>
                      </View>
                      <View style={styles.detailGrid}>
                        <View style={styles.detailGridItem}>
                          <Text style={styles.detailItemLabel}>Nền tảng</Text>
                          <Text style={styles.detailItemValue}>{detailDevice.platform}</Text>
                        </View>
                        <View style={styles.detailGridItem}>
                          <Text style={styles.detailItemLabel}>HĐH</Text>
                          <Text style={styles.detailItemValue} numberOfLines={1}>{detailDevice.osName || 'Không rõ'}</Text>
                        </View>
                      </View>
                      {(detailDevice.browserName || detailDevice.browserVersion) && (
                        <View style={styles.fullWidthDetailItem}>
                          <Text style={styles.detailItemLabel}>Trình duyệt</Text>
                          <Text style={styles.detailItemValue}>{detailDevice.browserName} {detailDevice.browserVersion}</Text>
                        </View>
                      )}
                    </View>
                    <Divider style={styles.modalDivider} />
                    <View>
                      <View style={styles.detailSectionTitleContainer}>
                        <MaterialCommunityIcons name="history" size={14} color="#6366f1" />
                        <Text style={styles.detailSectionTitle}>Hoạt động gần nhất</Text>
                      </View>
                      <View style={styles.activityList}>
                        <View style={styles.activityItem}>
                          <Text style={styles.activityLabel}>Lần cuối</Text>
                          <Text style={styles.activityValue}>{formatDate(detailDevice.lastActiveAt || detailDevice.lastUsedAt)}</Text>
                        </View>
                        <View style={styles.activityItem}>
                          <Text style={styles.activityLabel}>Địa chỉ IP</Text>
                          <Text style={styles.activityValueIP}>{detailDevice.lastIp || detailDevice.ipAddress || 'Không rõ'}</Text>
                        </View>
                        <View style={styles.activityItem}>
                          <Text style={styles.activityLabel}>Vị trí</Text>
                          <Text style={styles.activityValue}>{detailDevice.lastLocation || 'Không rõ vị trí'}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.modalFooter}>
                  <Pressable onPress={() => setDetailDevice(null)} style={styles.closeModalButton}>
                    <Text style={styles.closeModalButtonText}>Đóng</Text>
                  </Pressable>
                  <Pressable onPress={() => onForceLogoutDevice(detailDevice)} style={styles.logoutDeviceButton}>
                    <Text style={styles.logoutDeviceButtonText}>{detailDevice.deviceId === currentDeviceId ? 'Đăng xuất' : 'Gỡ bỏ phiên'}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
  },
  currentDeviceIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#6366f1',
  },
  deviceItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    justifyContent: 'center',
  },
  platformIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(244, 244, 245, 0.5)',
  },
  deviceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  deviceName: {
    fontWeight: 'bold',
    fontSize: 18,
    color: '#18181b',
  },
  thisDeviceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#6366f1',
    borderRadius: 9999,
  },
  badgeText: {
    fontSize: 9,
    color: '#ffffff',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#d1fae5',
    borderRadius: 9999,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 9999,
    backgroundColor: '#10b981',
    marginRight: 4,
  },
  activeText: {
    fontSize: 9,
    color: '#059669',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  osBrowserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  osText: {
    color: '#71717a',
    fontSize: 12,
  },
  dotSeparator: {
    color: '#d4d4d8',
  },
  browserContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  browserText: {
    color: '#71717a',
    fontSize: 12,
    marginLeft: 4,
  },
  locationContainer: {
    flexDirection: 'row',
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(244, 244, 245, 0.5)',
  },
  locationText: {
    fontSize: 10,
    color: '#71717a',
    fontWeight: '500',
    marginLeft: 4,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: '#a1a1aa',
    marginTop: 16,
    fontSize: 12,
    fontWeight: '500',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    marginLeft: 8,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#18181b',
  },
  scrollView: {
    backgroundColor: 'rgba(244, 244, 245, 0.3)',
  },
  scrollContent: {
    flexGrow: 1,
  },
  mainContent: {
    padding: 20,
  },
  infoBanner: {
    backgroundColor: 'rgba(238, 242, 255, 0.5)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(224, 231, 255, 0.5)',
  },
  infoBannerText: {
    color: '#3730a3',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 20,
  },
  sectionTitle: {
    color: '#a1a1aa',
    fontWeight: 'bold',
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 16,
    marginLeft: 4,
    letterSpacing: 1,
  },
  loadingContainer: {
    paddingVertical: 80,
    alignItems: 'center',
  },
  loadingText: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 16,
  },
  listWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(228, 228, 231, 0.6)',
    overflow: 'hidden',
  },
  footerInfo: {
    marginTop: 32,
    marginBottom: 16,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  footerInfoText: {
    color: '#a1a1aa',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    overflow: 'hidden',
  },
  modalHeader: {
    padding: 24,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f4f4f5',
  },
  modalHeaderInfo: {
    flex: 1,
  },
  modalDeviceName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#18181b',
    marginBottom: 4,
  },
  modalDeviceType: {
    fontSize: 10,
    color: '#a1a1aa',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalCloseButton: {
    padding: 8,
  },
  modalScroll: {
    padding: 24,
    maxHeight: 400,
  },
  modalDetails: {
    gap: 24,
  },
  detailSectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  detailSectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  detailGridItem: {
    flex: 1,
    backgroundColor: '#fafafa',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f4f4f5',
  },
  detailItemLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#a1a1aa',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailItemValue: {
    fontWeight: 'bold',
    color: '#27272a',
  },
  fullWidthDetailItem: {
    backgroundColor: '#fafafa',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f4f4f5',
  },
  modalDivider: {
    opacity: 0.5,
    marginVertical: 8,
  },
  activityList: {
    gap: 16,
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityLabel: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '500',
  },
  activityValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3f3f46',
  },
  activityValueIP: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6366f1',
  },
  modalFooter: {
    padding: 24,
    gap: 12,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f4f4f5',
  },
  closeModalButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#f4f4f5',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalButtonText: {
    fontWeight: 'bold',
    color: '#52525b',
  },
  logoutDeviceButton: {
    flex: 1.5,
    height: 48,
    backgroundColor: '#ef4444',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  logoutDeviceButtonText: {
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
