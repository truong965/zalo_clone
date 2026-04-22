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

const hasVoiceNativeBridge = (
  voice: ReturnType<typeof getVoiceSafe>,
): voice is NonNullable<ReturnType<typeof getVoiceSafe>> => {
  return !!voice && typeof voice.start === 'function' && typeof voice.isAvailable === 'function';
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
      if (!hasVoiceNativeBridge(voice)) {
        return { ok: false, reason: 'native_module_unavailable' };
      }
      const { status } = await requestRecordingPermissionsAsync();
      if (status !== 'granted') {
        return { ok: false, reason: 'permission_denied' };
      }
      let isAvailable = false;
      try {
        isAvailable = Boolean(await voice.isAvailable());
      } catch (error) {
        const message = String((error as Error)?.message ?? error);
        if (
          message.includes('isSpeechAvailable') ||
          message.includes('Native module cannot be null') ||
          message.includes('Cannot read property')
        ) {
          return { ok: false, reason: 'native_module_unavailable' };
        }
        throw error;
      }
      if (!isAvailable) {
        return { ok: false, reason: 'native_module_unavailable' };
      }
      finalResultRef.current = '';
      await voice.start('vi-VN');
      return { ok: true };
    } catch (error) {
      console.error('Voice dictation start failed', error);
      const message = String((error as Error)?.message ?? error);
      if (
        message.includes('startSpeech') ||
        message.includes('isSpeechAvailable') ||
        message.includes('Native module cannot be null') ||
        message.includes('Cannot read property')
      ) {
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
