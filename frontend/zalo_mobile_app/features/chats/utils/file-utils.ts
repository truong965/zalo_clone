import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';

let isShareRequestInProgress = false;

const shareFileSafely = async (
  uri: string,
  options?: Parameters<typeof Sharing.shareAsync>[1],
): Promise<boolean> => {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) return false;

  if (isShareRequestInProgress) {
    Toast.show({
      type: 'info',
      text1: 'Đang mở chia sẻ',
      text2: 'Vui lòng chờ thao tác trước hoàn tất',
      position: 'bottom',
    });
    return false;
  }

  isShareRequestInProgress = true;
  try {
    await Sharing.shareAsync(uri, options);
    return true;
  } finally {
    isShareRequestInProgress = false;
  }
};

export const handleOpenFile = async (src: string | null | undefined, originalName: string) => {
  if (!src) return;
  try {
    if (Platform.OS === 'web') {
      window.open(src, '_blank');
      return;
    }

    const fileUri = `${FileSystem.documentDirectory}${originalName}`;
    const { uri } = await FileSystem.downloadAsync(src, fileUri);

    await shareFileSafely(uri, {
      dialogTitle: 'Mở file bởi:',
      UTI: 'public.item'
    });
  } catch (error) {
    console.error('Open error:', error);
    Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Không thể mở tệp' });
  }
};

export const handleDownloadFile = async (src: string | null | undefined, originalName: string, mimeType?: string | null) => {
  if (!src) {
    Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Không có liên kết tải về' });
    return;
  }

  try {
    const safeFileName = originalName.replace(/[/\\?%*:|"<>]/g, '-');
    Toast.show({ type: 'info', text1: 'Bắt đầu tải...', text2: safeFileName, position: 'bottom' });

    const localUri = `${FileSystem.documentDirectory}${safeFileName}`;
    const downloadRes = await FileSystem.downloadAsync(src, localUri);

    if (downloadRes.status !== 200) throw new Error('Download failed');

    const actualMimeType = mimeType || 'application/octet-stream';

    if (actualMimeType.startsWith('image/') || actualMimeType.startsWith('video/')) {
      const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync(true, ['photo', 'video']);
      if (status === 'granted') {
        await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
        Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã lưu vào thư viện ảnh', position: 'top' });
      } else if (!canAskAgain) {
        Toast.show({ type: 'error', text1: 'Thất bại', text2: 'Vui lòng cấp quyền trong cài đặt', position: 'top' });
      } else {
        Toast.show({ type: 'error', text1: 'Thất bại', text2: 'Cần quyền truy cập thư viện', position: 'top' });
      }
    } else {
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            safeFileName,
            actualMimeType,
          );
          const fileData = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.writeAsStringAsync(newFileUri, fileData, { encoding: FileSystem.EncodingType.Base64 });
          Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã lưu file vào máy', position: 'top' });
        }
      } else {
        await shareFileSafely(localUri, { UTI: 'public.item' });
      }
    }
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  } catch (error) {
    console.error('Download error:', error);
    Toast.show({ type: 'error', text1: 'Lỗi tải xuống', text2: 'Không thể tải tệp vào lúc này', position: 'top' });
  }
};

export const handleShareFile = async (src: string | null | undefined, originalName: string) => {
  await handleOpenFile(src, originalName);
};
