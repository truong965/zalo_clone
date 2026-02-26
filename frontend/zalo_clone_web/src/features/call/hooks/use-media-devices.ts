/**
 * useMediaDevices — getUserMedia wrapper with device enumeration and fallback.
 *
 * Handles:
 * - Permission denied gracefully (returns error message)
 * - Device enumeration (camera/mic selection)
 * - devicechange events for hot-plug detection
 * - Camera switching (front/back on mobile)
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface MediaDeviceInfo {
      deviceId: string;
      label: string;
      kind: MediaDeviceKind;
}

interface UseMediaDevicesReturn {
      /** Available audio input devices */
      audioDevices: MediaDeviceInfo[];
      /** Available video input devices */
      videoDevices: MediaDeviceInfo[];
      /** Currently selected audio device ID */
      selectedAudioDeviceId: string | null;
      /** Currently selected video device ID */
      selectedVideoDeviceId: string | null;
      /** Select a different audio input device */
      selectAudioDevice: (deviceId: string) => void;
      /** Select a different video input device */
      selectVideoDevice: (deviceId: string) => void;
      /** Get a media stream with current device selection */
      getStream: (constraints: { audio: boolean; video: boolean }) => Promise<MediaStream | null>;
      /** Error from last operation */
      error: string | null;
      /** Whether we're currently loading devices */
      isLoading: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useMediaDevices(): UseMediaDevicesReturn {
      const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
      const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
      const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(null);
      const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(null);
      const [error, setError] = useState<string | null>(null);
      const [isLoading, setIsLoading] = useState(false);

      const isMountedRef = useRef(true);

      useEffect(() => {
            isMountedRef.current = true;
            return () => {
                  isMountedRef.current = false;
            };
      }, []);

      // ── Enumerate devices ─────────────────────────────────────────────

      const enumerateDevices = useCallback(async () => {
            try {
                  const devices = await navigator.mediaDevices.enumerateDevices();
                  if (!isMountedRef.current) return;

                  const audio = devices
                        .filter((d) => d.kind === 'audioinput')
                        .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${d.deviceId.slice(0, 5)}`, kind: d.kind }));
                  const video = devices
                        .filter((d) => d.kind === 'videoinput')
                        .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 5)}`, kind: d.kind }));

                  setAudioDevices(audio);
                  setVideoDevices(video);

                  // Auto-select first device if none selected
                  if (!selectedAudioDeviceId && audio.length > 0) {
                        setSelectedAudioDeviceId(audio[0].deviceId);
                  }
                  if (!selectedVideoDeviceId && video.length > 0) {
                        setSelectedVideoDeviceId(video[0].deviceId);
                  }
            } catch {
                  // enumerate can fail before getUserMedia grant
            }
      }, [selectedAudioDeviceId, selectedVideoDeviceId]);

      // ── Listen for device changes ─────────────────────────────────────

      useEffect(() => {
            if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

            void enumerateDevices();

            const handler = () => {
                  void enumerateDevices();
            };
            navigator.mediaDevices.addEventListener('devicechange', handler);

            return () => {
                  navigator.mediaDevices.removeEventListener('devicechange', handler);
            };
      }, [enumerateDevices]);

      // ── Get stream with current selection ─────────────────────────────

      const getStream = useCallback(
            async (constraints: { audio: boolean; video: boolean }): Promise<MediaStream | null> => {
                  setIsLoading(true);
                  setError(null);

                  try {
                        const mediaConstraints: MediaStreamConstraints = {
                              audio: constraints.audio
                                    ? selectedAudioDeviceId
                                          ? { deviceId: { exact: selectedAudioDeviceId } }
                                          : true
                                    : false,
                              video: constraints.video
                                    ? selectedVideoDeviceId
                                          ? { deviceId: { exact: selectedVideoDeviceId } }
                                          : true
                                    : false,
                        };

                        const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

                        // Re-enumerate after permission grant (labels become available)
                        void enumerateDevices();

                        if (!isMountedRef.current) {
                              for (const track of stream.getTracks()) track.stop();
                              return null;
                        }

                        return stream;
                  } catch (err) {
                        if (!isMountedRef.current) return null;

                        if (err instanceof DOMException) {
                              switch (err.name) {
                                    case 'NotAllowedError':
                                          setError('Quyền truy cập camera/microphone bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt.');
                                          break;
                                    case 'NotFoundError':
                                          setError('Không tìm thấy thiết bị camera/microphone.');
                                          break;
                                    case 'NotReadableError':
                                          setError('Thiết bị đang được sử dụng bởi ứng dụng khác.');
                                          break;
                                    case 'OverconstrainedError':
                                          // Fallback: try without device constraints
                                          try {
                                                const fallback = await navigator.mediaDevices.getUserMedia({
                                                      audio: constraints.audio,
                                                      video: constraints.video,
                                                });
                                                return fallback;
                                          } catch {
                                                setError('Không thể truy cập thiết bị media.');
                                          }
                                          break;
                                    default:
                                          setError('Lỗi không xác định khi truy cập thiết bị media.');
                              }
                        } else {
                              setError('Không thể truy cập thiết bị media.');
                        }
                        return null;
                  } finally {
                        if (isMountedRef.current) setIsLoading(false);
                  }
            },
            [selectedAudioDeviceId, selectedVideoDeviceId, enumerateDevices],
      );

      return {
            audioDevices,
            videoDevices,
            selectedAudioDeviceId,
            selectedVideoDeviceId,
            selectAudioDevice: setSelectedAudioDeviceId,
            selectVideoDevice: setSelectedVideoDeviceId,
            getStream,
            error,
            isLoading,
      };
}
