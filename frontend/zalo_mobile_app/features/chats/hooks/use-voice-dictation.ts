import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

type DictationStartResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported_platform' | 'permission_denied' | 'native_module_unavailable' | 'start_failed' };

const STT_DEBUG_PREFIX = '[STT_DEBUG]';
const sttDebugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log(STT_DEBUG_PREFIX, ...args);
  }
};

export function useVoiceDictation() {
  const [isListening, setIsListening] = useState(false);
  const finalResultRef = useRef('');

  useSpeechRecognitionEvent('start', () => {
    sttDebugLog('event: start');
    setIsListening(true);
  });

  useSpeechRecognitionEvent('end', () => {
    sttDebugLog('event: end');
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    // Collect the transcript from the first result entry.
    // `isFinal` may be false on partial results; we accumulate the latest value.
    const transcript = event.results[0]?.transcript ?? '';
    if (transcript) {
      finalResultRef.current = transcript.trim();
      sttDebugLog('event: result', {
        transcriptLength: finalResultRef.current.length,
        transcript: finalResultRef.current,
      });
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    sttDebugLog('event: error', event);
    setIsListening(false);
  });

  const start = useCallback(async (): Promise<DictationStartResult> => {
    sttDebugLog('start: requested', { platform: Platform.OS });
    if (Platform.OS !== 'android') {
      sttDebugLog('start: blocked - unsupported platform');
      return { ok: false, reason: 'unsupported_platform' };
    }

    try {
      // isRecognitionAvailable() is synchronous
      const isAvailable = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      if (!isAvailable) {
        sttDebugLog('start: blocked - engine unavailable');
        return { ok: false, reason: 'native_module_unavailable' };
      }

      // Request RECORD_AUDIO + speech recognition permissions
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      sttDebugLog('start: permission granted', granted);
      if (!granted) {
        sttDebugLog('start: blocked - permission denied');
        return { ok: false, reason: 'permission_denied' };
      }

      finalResultRef.current = '';
      sttDebugLog('start: invoking ExpoSpeechRecognitionModule.start');
      ExpoSpeechRecognitionModule.start({
        lang: 'vi-VN',
        interimResults: false,
        continuous: false,
      });

      sttDebugLog('start: success');
      return { ok: true };
    } catch (error) {
      console.error('Voice dictation start failed', error);
      sttDebugLog('start: failed', String((error as Error)?.message ?? error));
      return { ok: false, reason: 'start_failed' };
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      // stop() asks the recognizer to finalise and emit a result event
      sttDebugLog('stop: invoking ExpoSpeechRecognitionModule.stop()');
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // no-op — already stopped or never started
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
      // abort() cancels immediately without emitting a result event
      sttDebugLog('cancel: invoking ExpoSpeechRecognitionModule.abort()');
      ExpoSpeechRecognitionModule.abort();
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
