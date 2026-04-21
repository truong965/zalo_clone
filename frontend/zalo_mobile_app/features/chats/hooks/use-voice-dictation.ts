import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Voice from '@react-native-voice/voice';
import { requestRecordingPermissionsAsync } from 'expo-audio';

type DictationStartResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported_platform' | 'permission_denied' | 'native_module_unavailable' | 'start_failed' };

export function useVoiceDictation() {
  const [isListening, setIsListening] = useState(false);
  const finalResultRef = useRef('');

  useEffect(() => {
    Voice.onSpeechStart = () => setIsListening(true);
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechResults = (event) => {
      finalResultRef.current = event.value?.[0]?.trim() ?? '';
    };
    Voice.onSpeechError = () => setIsListening(false);

    return () => {
      Voice.destroy().catch(() => null);
      Voice.removeAllListeners();
    };
  }, []);

  const start = useCallback(async (): Promise<DictationStartResult> => {
    if (Platform.OS !== 'android') return { ok: false, reason: 'unsupported_platform' };
    try {
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        return { ok: false, reason: 'permission_denied' };
      }
      const isAvailable = await Voice.isAvailable();
      if (!isAvailable) {
        return { ok: false, reason: 'native_module_unavailable' };
      }
      finalResultRef.current = '';
      await Voice.start('vi-VN');
      return { ok: true };
    } catch (error) {
      console.error('Voice dictation start failed', error);
      if (error instanceof TypeError && String(error.message).includes('startSpeech')) {
        return { ok: false, reason: 'native_module_unavailable' };
      }
      return { ok: false, reason: 'start_failed' };
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await Voice.stop();
    } catch {
      // no-op
    }
    setIsListening(false);
    return finalResultRef.current;
  }, []);

  const cancel = useCallback(async () => {
    try {
      await Voice.cancel();
    } catch {
      // no-op
    }
    setIsListening(false);
    finalResultRef.current = '';
  }, []);

  return {
    isListening,
    start,
    stop,
    cancel,
  };
}
