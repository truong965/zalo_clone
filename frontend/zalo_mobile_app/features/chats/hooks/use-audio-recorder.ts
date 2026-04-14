import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorderState,
  useAudioRecorder as useExpoAudioRecorder
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';

const VOICE_RECORDING_PRESET = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

const buildVoiceFileName = (rawName: string, durationSeconds: number) => {
  const safeSeconds = Math.max(1, Math.floor(durationSeconds));
  const secondsSuffix = `_${safeSeconds}s`;
  const dotIndex = rawName.lastIndexOf('.');

  if (dotIndex <= 0) {
    return `voice_${Date.now()}${secondsSuffix}.m4a`;
  }

  const baseName = rawName.slice(0, dotIndex);
  const extension = rawName.slice(dotIndex);
  return `${baseName}${secondsSuffix}${extension}`;
};

/**
 * Extracts file metadata from a local URI dynamically.
 */
const getFileInfoFromUri = (localFilePath: string, durationSeconds: number) => {
  const rawName = localFilePath.split('/').pop()?.split('?')[0] || '';
  const fileName = buildVoiceFileName(rawName, durationSeconds);
  const extension = fileName.split('.').pop()?.toLowerCase();

  // Keep VOICE uploads consistently classified as AUDIO on backend.
  // Include common mobile recorder containers to avoid incorrect MIME tagging.
  let mimeType = 'audio/mp4';
  if (extension === 'm4a' || extension === 'mp4') {
    mimeType = 'audio/mp4';
  } else if (extension === 'webm' || extension === 'weba') {
    mimeType = 'audio/webm';
  } else if (extension === 'mp3') {
    mimeType = 'audio/mpeg';
  } else if (extension === 'ogg' || extension === 'oga') {
    mimeType = 'audio/ogg';
  } else if (extension === '3gp' || extension === '3gpp') {
    mimeType = 'audio/3gpp';
  } else if (extension === 'aac') {
    mimeType = 'audio/aac';
  } else if (extension === 'amr') {
    mimeType = 'audio/amr';
  } else if (extension === 'caf') {
    mimeType = 'audio/x-caf';
  } else if (extension === 'wav') {
    mimeType = 'audio/wav';
  } else {
    // Fallback for voice recordings if extension is unknown
    mimeType = 'audio/mp4';
  }

  return { fileName, mimeType, uri: localFilePath, extension };
};

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState('00:00');
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const startInFlightRef = useRef(false);
  const { accessToken } = useAuth();

  // Use HIGH_QUALITY preset which targets AAC/M4A on both platforms
  const recorder = useExpoAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Sync duration from recorder state
  useEffect(() => {
    setRecordingDuration(formatTime(state.durationMillis));
    if (state.durationMillis >= 600000 && isRecording) {
      void stopAndSend();
    }
  }, [state.durationMillis, isRecording]);

  const startRecording = useCallback(async () => {
    if (startInFlightRef.current || isRecording || isUploadingAudio) {
      return;
    }

    startInFlightRef.current = true;
    try {
      if (!accessToken) {
        Toast.show({
          type: 'error',
          text1: 'Chưa đăng nhập',
          text2: 'Vui lòng đăng nhập để gửi tin nhắn thoại',
          position: 'top',
        });
        return;
      }

      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        console.error('Permission to access microphone was denied');
        Toast.show({
          type: 'error',
          text1: 'Chưa cấp quyền micro',
          text2: 'Hãy cấp quyền ghi âm trong cài đặt',
          position: 'top',
        });
        return;
      }

      // Ensure previous recorder session is fully released before preparing again.
      try {
        await recorder.stop();
      } catch {
        // no-op: recorder may already be stopped/uninitialized
      }

      await recorder.prepareToRecordAsync(VOICE_RECORDING_PRESET);
      recorder.record();
      setIsRecording(true);
      setRecordingDuration('00:00');
      setRecordingUri(null);
    } catch (err) {
      console.error('Failed to start recording', err);
      Toast.show({
        type: 'error',
        text1: 'Lỗi ghi âm',
        text2: 'Không thể khởi động micro',
        position: 'top',
      });
    } finally {
      startInFlightRef.current = false;
    }
  }, [accessToken, recorder, isRecording, isUploadingAudio]);

  const cancelRecording = useCallback(async () => {
    try {
      await recorder.stop();
    } catch (error) {
      console.error('Error stopping recording on cancel', error);
    }
    setIsRecording(false);
    setRecordingDuration('00:00');
    setRecordingUri(null);
  }, [recorder]);

  const preparePreview = useCallback(async (): Promise<string | null> => {
    if (recordingUri) return recordingUri;

    try {
      const uriBeforeStop = recorder.uri;
      await recorder.stop();
      const uri = recorder.uri || uriBeforeStop;

      setIsRecording(false);
      if (uri) {
        setRecordingUri(uri);
        return uri;
      }
      return null;
    } catch (error) {
      console.error('Failed to prepare voice preview', error);
      return null;
    }
  }, [recorder, recordingUri]);

  const stopAndSend = useCallback(async (): Promise<string | null> => {
    if (!accessToken) {
      Toast.show({
        type: 'error',
        text1: 'Chưa đăng nhập',
        text2: 'Vui lòng đăng nhập để gửi tin nhắn thoại',
        position: 'top',
      });
      return null;
    }

    try {
      const currentDurationMillis = state.durationMillis ?? 0;
      if (currentDurationMillis < 3000) {
        Toast.show({
          type: 'error',
          text1: 'Chưa thể gửi',
          text2: 'Tin nhắn thoại phải dài ít nhất 3 giây',
          position: 'top',
        });
        return null;
      }

      setIsUploadingAudio(true);
      let uri = recordingUri;
      if (!uri) {
        const uriBeforeStop = recorder.uri;
        await recorder.stop();
        uri = recorder.uri || uriBeforeStop;
      }

      setIsRecording(false);
      setRecordingDuration('00:00');
      setRecordingUri(null);

      if (!uri) throw new Error('No URI available from recording');

      // 1. Get dynamic file info from the URI
      const durationSeconds = currentDurationMillis / 1000;
      const { fileName, mimeType } = getFileInfoFromUri(uri, durationSeconds);

      // 2. Re-use 3-step S3 upload process
      const initResponse = await mobileApi.initiateUpload({
        fileName,
        mimeType,
        fileSize: 1024, // Approximation
      }, accessToken);

      const fileInfo = {
        uri,
        type: mimeType,
        name: fileName,
      };

      await mobileApi.uploadToS3(initResponse.presignedUrl, fileInfo);

      const confirmResponse = await mobileApi.confirmUpload(initResponse.uploadId, accessToken);
      return confirmResponse.id as string;
    } catch (err) {
      console.error('Failed to stop/upload recording', err);
      Toast.show({
        type: 'error',
        text1: 'Lỗi gửi tin nhắn thoại',
        text2: 'Vui lòng kiểm tra kết nối mạng',
        position: 'top',
      });
      return null;
    } finally {
      setIsUploadingAudio(false);
    }
  }, [accessToken, recorder, recordingUri, state.durationMillis]);

  return {
    isRecording,
    recordingDuration,
    isUploadingAudio,
    recordingUri,
    metering: state.metering,
    startRecording,
    cancelRecording,
    preparePreview,
    stopAndSend,
  };
}




