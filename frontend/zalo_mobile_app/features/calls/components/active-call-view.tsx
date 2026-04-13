import { UserAvatar } from '@/components/ui/user-avatar';
import { useAuth } from '@/providers/auth-provider';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RTCView } from 'react-native-webrtc';
import { useCallActions } from '../hooks/use-call-actions';
import { useCallStore } from '../stores/call.store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function ActiveCallView() {
  const {
    peerInfo,
    callType,
    callDuration,
    isPeerConnected,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    peerCameraOff,
    isSpeakerOn,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    callStatus
  } = useCallStore();
  const { user } = useAuth();
  const { endCall } = useCallActions();
  const insets = useSafeAreaInsets();

  const [remoteVideoOff, setRemoteVideoOff] = useState(false);

  // Animation for draggable PiP
  const pan = React.useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - 120, y: 100 })).current;

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.extractOffset();
      },
    })
  ).current;

  useEffect(() => {
    // Detect if remote peer has their video tracks disabled
    const checkTracks = () => {
      if (!remoteStream) {
        setRemoteVideoOff(false);
        return;
      }
      const videoTracks = remoteStream.getVideoTracks();
      // On mobile, sometimes tracks are removed or muted
      setRemoteVideoOff(
        videoTracks.length === 0 || videoTracks.every((t: any) => !t.enabled || t.muted)
      );
    };

    checkTracks();

    remoteStream?.getVideoTracks().forEach((track: any) => {
      track.addEventListener('mute', checkTracks);
      track.addEventListener('unmute', checkTracks);
    });

    return () => {
      remoteStream?.getVideoTracks().forEach((track: any) => {
        track.removeEventListener('mute', checkTracks);
        track.removeEventListener('unmute', checkTracks);
      });
    };
  }, [remoteStream]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Remote Video Placeholder or RTCView */}
      <View style={styles.remoteVideoContainer}>
        {remoteStream && isPeerConnected && !remoteVideoOff && !peerCameraOff ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.remoteVideo}
            objectFit="cover"
            zOrder={0}
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <UserAvatar uri={peerInfo?.avatarUrl} size={150} />
            <Text style={styles.remoteName}>{peerInfo?.displayName}</Text>
            <Text style={styles.statusText}>
              {!isPeerConnected
                ? (callStatus === 'RECONNECTING' ? 'Đang kết nối lại...' : 'Đang kết nối...')
                : ((remoteVideoOff || peerCameraOff) ? 'Đang trong cuộc gọi' : 'Đang tải video...')}
            </Text>
          </View>
        )}
      </View>

      {/* Top Header */}
      <View style={[styles.header, { top: insets.top + 10 }]}>
        {isPeerConnected && (
          <View style={styles.timerContainer}>
            <View style={styles.redDot} />
            <Text style={styles.timerText}>{formatDuration(callDuration)}</Text>
          </View>
        )}
      </View>

      {/* Floating Local Camera (Selfie View) — Always show for unified layout */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.floatingLocalView,
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
          },
        ]}
      >
        {!isCameraOff && localStream ? (
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.localCamera}
            objectFit="cover"
            zOrder={1}
            mirror={true}
          />
        ) : (
          <View style={styles.localAvatarOverlay}>
            <UserAvatar uri={user?.avatarUrl} size={60} />
          </View>
        )}
      </Animated.View>

      {/* Connecting Overlay */}
      {!isPeerConnected && (
        <View style={styles.connectingOverlay}>
          <UserAvatar uri={peerInfo?.avatarUrl} size={120} />
          <Text style={styles.connectingText}>
            {callStatus === 'RECONNECTING' ? 'Đang kết nối lại...' : 'Đang kết nối...'}
          </Text>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={[styles.controls, { bottom: insets.bottom + 40 }]}>
        <TouchableOpacity
          style={[styles.controlBtn, isSpeakerOn && styles.controlBtnActive]}
          onPress={toggleSpeaker}
        >
          <Ionicons name={isSpeakerOn ? "volume-high" : "volume-medium"} size={28} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={toggleMute}
        >
          <Ionicons name={isMuted ? "mic-off" : "mic"} size={28} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, styles.endCallBtn]}
          onPress={endCall}
        >
          <Ionicons name="call" size={32} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, isCameraOff && styles.controlBtnActive]}
          onPress={toggleCamera}
        >
          <Ionicons name={isCameraOff ? "videocam-off" : "videocam"} size={28} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  remoteVideoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  remoteName: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
  },
  statusText: {
    color: '#aaa',
    fontSize: 14,
    marginTop: 8,
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  timerText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
    marginRight: 8,
  },
  floatingLocalView: {
    position: 'absolute',
    width: 100,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#333',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    elevation: 5,
    zIndex: 20,
  },
  localCamera: {
    flex: 1,
  },
  connectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  connectingAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#fff',
  },
  connectingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    zIndex: 10,
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  endCallBtn: {
    backgroundColor: '#ff3b30',
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  localAvatarOverlay: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
