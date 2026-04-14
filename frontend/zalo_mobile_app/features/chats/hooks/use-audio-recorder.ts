import { useState, useCallback, useEffect } from 'react';
import { 
  useAudioRecorder as useExpoAudioRecorder, 
  useAudioRecorderState,
  RecordingPresets, 
  requestRecordingPermissionsAsync 
} from 'expo-audio';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';

/**
 * Extracts file metadata from a local URI dynamically.
 */
const getFileInfoFromUri = (localFilePath: string) => {
  const rawFileName = localFilePath.split('/').pop() || `voice_${Date.now()}`;
  
  // Ensure we have a valid extension for audio files
  let fileName = rawFileName;
  const parts = rawFileName.split('.');
  let extension = parts.length > 1 ? parts.pop()?.toLowerCase() : undefined;
  
  if (!extension) {
    extension = 'm4a';
    fileName = `${rawFileName}.m4a`;
  }

  let mimeType = 'application/octet-stream';
  if (extension === 'm4a' || extension === 'mp4') {
    mimeType = 'audio/mp4';
  } else if (extension === 'aac') {
    mimeType = 'audio/aac';
  } else if (extension === 'amr') {
    mimeType = 'audio/amr';
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
    try {
      if (!accessToken) throw new Error('Not authenticated');

      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        console.error('Permission to access microphone was denied');
        return;
      }

      await recorder.prepareToRecordAsync({
          isMeteringEnabled: true,
      });
      recorder.record();
      setIsRecording(true);
      setRecordingDuration('00:00');
    } catch (err) {
      console.error('Failed to start recording', err);
      Toast.show({
        type: 'error',
        text1: 'Lỗi ghi âm',
        text2: 'Không thể khởi động micro',
        position: 'top',
      });
    }
  }, [accessToken, recorder]);

  const cancelRecording = useCallback(async () => {
    try {
      await recorder.stop();
    } catch (error) {
       console.error('Error stopping recording on cancel', error);
    }
    setIsRecording(false);
    setRecordingDuration('00:00');
  }, [recorder]);

  const stopAndSend = useCallback(async (): Promise<string | null> => {
    if (!accessToken) return null;

    try {
      setIsUploadingAudio(true);
      const uri = recorder.uri;
      
      // Stop the recorder first to finalize the file
      await recorder.stop();
      
      setIsRecording(false);
      setRecordingDuration('00:00');

      if (!uri) throw new Error('No URI available from recording');

      // 1. Get dynamic file info from the URI
      const { fileName, mimeType } = getFileInfoFromUri(uri);

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
  }, [accessToken, recorder]);

  return {
    isRecording,
    recordingDuration,
    isUploadingAudio,
    metering: state.metering,
    startRecording,
    cancelRecording,
    stopAndSend,
  };
}




