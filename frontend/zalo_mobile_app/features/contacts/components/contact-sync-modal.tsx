import React from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useContactSyncStore } from '../stores/contact-sync.store';
import { Ionicons } from '@expo/vector-icons';
import { useSyncContacts } from '../hooks/use-sync-contacts';

export function ContactSyncModal() {
  const { 
    status, 
    isVisible,
    processedContacts, 
    totalContacts, 
    error, 
    hideModal,
    reset 
  } = useContactSyncStore();
  
  const { performSyncSync } = useSyncContacts();

  if (!isVisible) return null;

  const isSyncing = status === 'syncing';
  const isProcessing = status === 'processing';
  const isConfirming = status === 'confirming';
  const isSuccess = status === 'success';
  const isError = status === 'error' || status === 'ratelimited';

  const handleConfirm = () => {
    performSyncSync();
  };

  const handleClose = () => {
    if (isSuccess || isError) {
      reset();
    } else {
      hideModal();
    }
  };

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        <View className="w-full max-w-md rounded-3xl bg-background p-6 shadow-2xl relative">
          
          {/* Close Button - Always visible except during initial local sync/hash if we want to force it */}
          {(!isSyncing) && (
            <TouchableOpacity 
              onPress={handleClose}
              className="absolute top-4 right-4 z-10 p-1"
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          )}

          {/* Confirmation State */}
          {isConfirming && (
            <View>
              <View className="mb-6 items-center">
                <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Ionicons name="people-outline" size={32} color="#007AFF" />
                </View>
                <Text className="text-center text-2xl font-bold text-gray-800">
                  Đồng bộ danh bạ
                </Text>
              </View>

              <View className="mb-6 space-y-4">
                <View className="flex-row items-start space-x-3">
                  <Ionicons name="alert-circle-outline" size={24} color="#F59E0B" />
                  <View className="flex-1">
                    <Text className="text-gray-800 font-bold text-lg">Giới hạn đồng bộ</Text>
                    <Text className="text-gray-600 text-base mt-2 leading-6">
                      Bạn chỉ có thể thực hiện đồng bộ danh bạ 1 lần mỗi ngày.
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-start space-x-3">
                  <Ionicons name="time-outline" size={24} color="#007AFF" />
                  <View className="flex-1">
                    <Text className="text-gray-800 font-bold text-lg">Thời gian xử lý</Text>
                    <Text className="text-gray-600 text-base mt-2 leading-6">
                      Quá trình này có thể diễn ra trong vài phút tùy vào số lượng liên lạc. Vui lòng đừng tắt ứng dụng.
                    </Text>
                  </View>
                </View>
              </View>

              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={handleClose}
                  className="flex-1 items-center rounded-xl bg-secondary py-4 border border-border"
                >
                  <Text className="font-bold text-foreground">Để sau</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={isSyncing}
                  className={`flex-1 items-center justify-center rounded-xl py-4 shadow-md ${
                    isSyncing ? 'bg-primary/50' : 'bg-primary'
                  }`}
                >
                  <Text className="font-bold text-primary-foreground">Đồng bộ ngay</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Syncing State (Local Hashing) */}
          {isSyncing && (
            <View className="items-center py-6">
              <ActivityIndicator size="large" color="#007AFF" className="mb-6" />
              <Text className="text-xl font-bold text-gray-800 mb-2">
                Đang chuẩn bị dữ liệu...
              </Text>
              {totalContacts > 0 && (
                <Text className="text-gray-600 text-lg mb-4">
                  Đang xử lý {processedContacts} / {totalContacts} liên lạc
                </Text>
              )}
              <Text className="text-center text-gray-600 text-base px-4 leading-6">
                Vui lòng giữ ứng dụng mở để chuẩn bị dữ liệu gửi lên máy chủ.
              </Text>
            </View>
          )}

          {/* Processing State (Server-side) */}
          {isProcessing && (
            <View className="items-center py-6">
              <ActivityIndicator size="large" color="#007AFF" className="mb-6" />
              <Text className="text-xl font-bold text-gray-800 mb-2">
                Đang đồng bộ trên máy chủ...
              </Text>
              <Text className="text-center text-gray-600 text-base px-4 leading-6 mb-6">
                Dữ liệu đã được gửi thành công. Máy chủ đang thực hiện đối soát và cập nhật danh sách bạn bè.
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                className="w-full items-center rounded-xl bg-primary/10 py-4 border border-primary/20"
              >
                <Text className="font-bold text-primary">Chạy ngầm</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Success State */}
          {isSuccess && (
            <View className="items-center py-6">
              <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              </View>
              <Text className="text-xl font-bold text-gray-800 text-center">
                Đồng bộ hoàn tất!
              </Text>
              <Text className="text-gray-600 mt-2 text-center text-base">
                Danh sách bạn bè của bạn đã được cập nhật thành công.
              </Text>
            </View>
          )}

          {/* Error / Rate Limit State */}
          {isError && (
            <View>
              <View className="items-center mb-6">
                <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                  <Ionicons 
                    name={status === 'ratelimited' ? 'time' : 'alert-circle'} 
                    size={32} 
                    color="#EF4444" 
                  />
                </View>
                <Text className="text-center text-xl font-bold text-gray-800">
                  {status === 'ratelimited' ? 'Giới hạn đồng bộ' : 'Lỗi đồng bộ'}
                </Text>
                <Text className="mt-4 text-center text-gray-600 text-base leading-6 px-2">
                  {error || 'Đã có lỗi xảy ra trong quá trình đồng bộ.'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleClose}
                className="w-full items-center rounded-xl bg-secondary py-4 border border-border"
              >
                <Text className="font-bold text-foreground">Đóng</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </View>
    </Modal>
  );
}
