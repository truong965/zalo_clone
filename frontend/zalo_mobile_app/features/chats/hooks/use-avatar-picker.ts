import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';

export interface PickedAvatar {
  uri: string;
  type: string;
  name: string;
  fileSize: number;
}

export function useAvatarPicker() {
  const [isUploading, setIsUploading] = useState(false);
  const { accessToken } = useAuth();

  const pickImage = useCallback(async (source: 'camera' | 'library'): Promise<PickedAvatar | null> => {
    try {
      const permissionResult = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.status !== 'granted') {
        Toast.show({
          type: 'error',
          text1: 'Lỗi',
          text2: `Cần quyền truy cập ${source === 'camera' ? 'camera' : 'thư viện ảnh'}`
        });
        return null;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        // Get actual file size
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        const fileSize = fileInfo.exists ? fileInfo.size : (asset.fileSize || 1);

        return {
          uri: asset.uri,
          type: asset.mimeType || 'image/jpeg',
          name: asset.fileName || `avatar_${Date.now()}.jpg`,
          fileSize: fileSize,
        };
      }
      return null;
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể chọn ảnh' });
      return null;
    }
  }, []);

  const uploadAvatar = useCallback(async (pickedImage: PickedAvatar, targetId?: string, targetType?: 'USER' | 'GROUP'): Promise<string> => {
    if (!accessToken) throw new Error('Not authenticated');

    setIsUploading(true);
    try {
      // 1. Initiate upload specifically for avatar
      const { presignedUrl, fileUrl } = await mobileApi.initiateAvatarUpload(
        {
          fileName: pickedImage.name,
          mimeType: pickedImage.type,
          fileSize: pickedImage.fileSize,
          targetId,
          targetType,
        },
        accessToken
      );

      // 2. Upload to S3
      await mobileApi.uploadToS3(presignedUrl, {
        uri: pickedImage.uri,
        type: pickedImage.type,
        name: pickedImage.name,
      });

      return fileUrl;
    } catch (error: any) {
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, [accessToken]);

  return { pickImage, uploadAvatar, isUploading };
}
