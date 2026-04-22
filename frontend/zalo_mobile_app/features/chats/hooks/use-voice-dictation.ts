import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Voice from '@react-native-voice/voice';
import { requestRecordingPermissionsAsync } from 'expo-audio';

type DictationStartResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported_platform' | 'permission_denied' | 'native_module_unavailable' | 'start_failed' };

const getVoiceSafe = () => {
  if (!Voice || typeof Voice !== 'object') {
    return null;
  }
  return Voice;
};

export function useVoiceDictation() {
  const [isListening, setIsListening] = useState(false);
  const finalResultRef = useRef('');

  useEffect(() => {
    const voice = getVoiceSafe();
    if (!voice) {
      return;
    }

    try {
      voice.onSpeechStart = () => setIsListening(true);
      voice.onSpeechEnd = () => setIsListening(false);
      voice.onSpeechResults = (event) => {
        finalResultRef.current = event.value?.[0]?.trim() ?? '';
      };
      voice.onSpeechError = () => setIsListening(false);
    } catch (error) {
      console.warn('Voice listeners setup skipped', error);
      return;
    }

    return () => {
      const voiceOnCleanup = getVoiceSafe();
      if (!voiceOnCleanup) {
        return;
      }

      try {
        voiceOnCleanup.destroy?.().catch(() => null);
      } catch {
        // no-op
      }
      try {
        voiceOnCleanup.removeAllListeners?.();
      } catch {
        // no-op
      }
    };
  }, []);

  const start = useCallback(async (): Promise<DictationStartResult> => {
    if (Platform.OS !== 'android') return { ok: false, reason: 'unsupported_platform' };
    try {
      const voice = getVoiceSafe();
      if (!voice) {
        return { ok: false, reason: 'native_module_unavailable' };
      }
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        return { ok: false, reason: 'permission_denied' };
      }
      const isAvailable = await voice.isAvailable();
      if (!isAvailable) {
        return { ok: false, reason: 'native_module_unavailable' };
      }
      finalResultRef.current = '';
      await voice.start('vi-VN');
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
      const voice = getVoiceSafe();
      await voice?.stop?.();
    } catch {
      // no-op
    }
    setIsListening(false);
    return finalResultRef.current;
  }, []);

  const cancel = useCallback(async () => {
    try {
      const voice = getVoiceSafe();
      await voice?.cancel?.();
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
