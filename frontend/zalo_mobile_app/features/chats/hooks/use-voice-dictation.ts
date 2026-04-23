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

const STT_DEBUG_PREFIX = '[STT_DEBUG]';
const sttDebugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log(STT_DEBUG_PREFIX, ...args);
  }
};

export function useVoiceDictation() {
  const [isListening, setIsListening] = useState(false);
  const finalResultRef = useRef('');

  useEffect(() => {
    const voice = getVoiceSafe();
    if (!voice) {
      sttDebugLog('setup: voice module unavailable');
      return;
    }

    try {
      sttDebugLog('setup: attaching listeners');
      voice.onSpeechStart = () => {
        sttDebugLog('event: onSpeechStart');
        setIsListening(true);
      };
      voice.onSpeechEnd = () => {
        sttDebugLog('event: onSpeechEnd');
        setIsListening(false);
      };
      voice.onSpeechResults = (event: any) => {
        const candidates = event.value ?? [];
        finalResultRef.current = candidates[0]?.trim() ?? '';
        sttDebugLog('event: onSpeechResults', {
          candidateCount: candidates.length,
          firstCandidate: finalResultRef.current,
        });
      };
      voice.onSpeechError = (event: any) => {
        sttDebugLog('event: onSpeechError', event);
        setIsListening(false);
      };
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
        sttDebugLog('cleanup: destroying voice module');
        voiceOnCleanup.destroy?.().catch(() => null);
      } catch {
        // no-op
      }
      try {
        sttDebugLog('cleanup: removing listeners');
        voiceOnCleanup.removeAllListeners?.();
      } catch {
        // no-op
      }
    };
  }, []);

  const start = useCallback(async (): Promise<DictationStartResult> => {
    sttDebugLog('start: requested', { platform: Platform.OS });
    if (Platform.OS !== 'android') {
      sttDebugLog('start: blocked - unsupported platform');
      return { ok: false, reason: 'unsupported_platform' };
    }
    try {
      const voice = getVoiceSafe();
      if (!hasVoiceNativeBridge(voice)) {
        sttDebugLog('start: blocked - native bridge unavailable');
        return { ok: false, reason: 'native_module_unavailable' };
      }
      sttDebugLog('start: requesting microphone permission');
      const { status } = await requestRecordingPermissionsAsync();
      sttDebugLog('start: permission status', status);
      if (status !== 'granted') {
        sttDebugLog('start: blocked - permission denied');
        return { ok: false, reason: 'permission_denied' };
      }
      let isAvailable = false;
      try {
        sttDebugLog('start: checking voice.isAvailable()');
        isAvailable = Boolean(await voice.isAvailable());
        sttDebugLog('start: voice.isAvailable() result', isAvailable);
      } catch (error) {
        const message = String((error as Error)?.message ?? error);
        sttDebugLog('start: isAvailable failed', message);
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
        sttDebugLog('start: blocked - engine unavailable');
        return { ok: false, reason: 'native_module_unavailable' };
      }
      finalResultRef.current = '';
      sttDebugLog('start: invoking voice.start("vi-VN")');
      await voice.start('vi-VN');
      sttDebugLog('start: success');
      return { ok: true };
    } catch (error) {
      console.error('Voice dictation start failed', error);
      const message = String((error as Error)?.message ?? error);
      sttDebugLog('start: failed with error', message);
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
      sttDebugLog('stop: invoking voice.stop()');
      await voice?.stop?.();
    } catch {
      // no-op
    }
    setIsListening(false);
    sttDebugLog('stop: transcript', {
      transcriptLength: finalResultRef.current.length,
      transcript: finalResultRef.current,
    });
    return finalResultRef.current;
  }, []);

  const cancel = useCallback(async () => {
    try {
      const voice = getVoiceSafe();
      sttDebugLog('cancel: invoking voice.cancel()');
      await voice?.cancel?.();
    } catch {
      // no-op
    }
    setIsListening(false);
    finalResultRef.current = '';
    sttDebugLog('cancel: done and cleared transcript');
  }, []);

  return {
    isListening,
    start,
    stop,
    cancel,
  };
}
