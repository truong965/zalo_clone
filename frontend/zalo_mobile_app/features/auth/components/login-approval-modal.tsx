import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLoginApprovalStore } from '../stores/login-approval.store';
import { mobileApi } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/auth-provider';

export function LoginApprovalModal() {
  const { t } = useTranslation();
  const { activeRequest, isOpen, dismissRequest } = useLoginApprovalStore();
  const { accessToken } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  if (!activeRequest) return null;

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await mobileApi.acknowledgePush(activeRequest.pendingToken, true, accessToken || undefined);
      dismissRequest();
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    setIsLoading(true);
    try {
      await mobileApi.acknowledgePush(activeRequest.pendingToken, false, accessToken || undefined);
      dismissRequest();
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('common.error'));
      dismissRequest();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      transparent
      visible={isOpen}
      animationType="fade"
      onRequestClose={dismissRequest}
    >
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View className="w-full max-w-md rounded-3xl bg-background p-6 shadow-2xl">
          <View className="mb-6 items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Ionicons name="shield-checkmark" size={32} color="#007AFF" />
            </View>
            <Text className="text-center text-2xl font-bold text-foreground">
              Yêu cầu đăng nhập
            </Text>
            <Text className="mt-2 text-center text-muted">
              Có một yêu cầu đăng nhập mới vào tài khoản của bạn
            </Text>
          </View>

          <View className="mb-8 rounded-2xl bg-secondary p-4 border border-border">
            <View className="mb-3 flex-row items-center border-b border-border/50 pb-2">
              <Ionicons name="desktop-outline" size={20} color="#6b7280" />
              <Text className="ml-2 font-semibold text-foreground">
                Thiết bị: <Text className="font-normal">{activeRequest.deviceName}</Text>
              </Text>
            </View>
            <View className="mb-3 flex-row items-center border-b border-border/50 pb-2">
              <Ionicons name="location-outline" size={20} color="#6b7280" />
              <Text className="ml-2 font-semibold text-foreground">
                Vị trí: <Text className="font-normal">{activeRequest.location || 'Không xác định'}</Text>
              </Text>
            </View>
            <View className="flex-row items-center">
              <Ionicons name="globe-outline" size={20} color="#6b7280" />
              <Text className="ml-2 font-semibold text-foreground">
                Địa chỉ IP: <Text className="font-normal">{activeRequest.ipAddress || 'Không xác định'}</Text>
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={handleReject}
              disabled={isLoading}
              className="flex-1 items-center rounded-xl bg-secondary py-4 border border-border"
            >
              <Text className="font-bold text-foreground">Từ chối</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={handleApprove}
              disabled={isLoading}
              className="flex-2 items-center rounded-xl bg-primary py-4 shadow-md flex-[2]"
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="font-bold text-primary-foreground">Phê duyệt</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
