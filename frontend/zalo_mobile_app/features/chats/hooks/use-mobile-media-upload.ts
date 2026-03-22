import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';

export interface MobileAsset {
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  type: 'image' | 'video' | 'document';
}

export function useMobileMediaUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const { accessToken } = useAuth();

  const pickMedia = useCallback(async (): Promise<MobileAsset[]> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return [];
    }

    return result.assets.map(asset => ({
      uri: asset.uri,
      fileName: asset.fileName || asset.uri.split('/').pop() || `media_${Date.now()}.jpg`,
      mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      fileSize: asset.fileSize || 0,
      type: asset.type === 'video' ? 'video' : 'image',
    }));
  }, []);

  const pickDocuments = useCallback(async (): Promise<MobileAsset[]> => {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      type: '*/*',
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return [];
    }

    return result.assets.slice(0, 10).map(asset => ({
      uri: asset.uri,
      fileName: asset.name || asset.uri.split('/').pop() || `doc_${Date.now()}`,
      mimeType: asset.mimeType || 'application/octet-stream',
      fileSize: asset.size || 0,
      type: 'document',
    }));
  }, []);

  const uploadAsset = useCallback(async (asset: MobileAsset): Promise<string> => {
    if (!accessToken) throw new Error('Not authenticated');
    
    // Step 1: Initiate
    const initResponse = await mobileApi.initiateUpload({
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
    }, accessToken);

    // Step 2: Upload to S3
    const fileInfo = {
      uri: asset.uri,
      type: asset.mimeType,
      name: asset.fileName,
    };
    await mobileApi.uploadToS3(initResponse.presignedUrl, fileInfo);

    // Step 3: Confirm
    const confirmResponse = await mobileApi.confirmUpload(initResponse.uploadId, accessToken);
    return confirmResponse.id as string;
  }, [accessToken]);

  return { pickMedia, pickDocuments, uploadAsset, isUploading, setIsUploading };
}

