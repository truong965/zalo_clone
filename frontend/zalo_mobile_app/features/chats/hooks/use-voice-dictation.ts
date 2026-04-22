import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

type DictationStartResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported_platform' | 'permission_denied' | 'native_module_unavailable' | 'start_failed' };

export function useVoiceDictation() {
  const [isListening, setIsListening] = useState(false);
  const finalResultRef = useRef('');

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    // Collect the transcript from the first result entry.
    // `isFinal` may be false on partial results; we accumulate the latest value.
    const transcript = event.results[0]?.transcript ?? '';
    if (transcript) {
      finalResultRef.current = transcript.trim();
    }
  });

  useSpeechRecognitionEvent('error', () => {
    setIsListening(false);
  });

  const start = useCallback(async (): Promise<DictationStartResult> => {
    if (Platform.OS !== 'android') return { ok: false, reason: 'unsupported_platform' };

    try {
      // isRecognitionAvailable() is synchronous
      const isAvailable = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      if (!isAvailable) {
        return { ok: false, reason: 'native_module_unavailable' };
      }

      // Request RECORD_AUDIO + speech recognition permissions
      const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        return { ok: false, reason: 'permission_denied' };
      }

      finalResultRef.current = '';

      ExpoSpeechRecognitionModule.start({
        lang: 'vi-VN',
        interimResults: false,
        continuous: false,
      });

      return { ok: true };
    } catch (error) {
      console.error('Voice dictation start failed', error);
      return { ok: false, reason: 'start_failed' };
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      // stop() asks the recognizer to finalise and emit a result event
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // no-op — already stopped or never started
    }
    setIsListening(false);
    return finalResultRef.current;
  }, []);

  const cancel = useCallback(async () => {
    try {
      // abort() cancels immediately without emitting a result event
      ExpoSpeechRecognitionModule.abort();
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
