import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallActions } from '../hooks/use-call-actions';
import { useCallStore } from '../stores/call.store';
import { ActiveCallView } from './active-call-view';
import { GroupCallWebView } from './group-call-webview';

export function IncomingCallModal() {
  const { callStatus, incomingCall, peerInfo, callType, dailyRoomUrl, dailyToken, callDuration, tick } = useCallStore();
  const isPeerConnected = useCallStore((s) => s.isPeerConnected);
  const { acceptCall, rejectCall, endCall } = useCallActions();
  const insets = useSafeAreaInsets();

  // Timer logic moved to useWebRTCCall hook

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    console.log('[IncomingCallModal] status changed:', callStatus);

    // RINGING auto-reject (30s) - match web RINGING_TIMEOUT_S
    let timeout: any = null;
    if (callStatus === 'RINGING' && incomingCall) {
      timeout = setTimeout(() => {
        console.warn('[IncomingCallModal] RINGING timeout reached (30s), auto-rejecting...');
        rejectCall();
      }, 30_000);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [callStatus, incomingCall, rejectCall]);

  const isIncoming = callStatus === 'RINGING' && incomingCall !== null;
  const isDialing = callStatus === 'DIALING';
  const isReconnecting = callStatus === 'RECONNECTING';
  const isWebActive = callStatus === 'ACTIVE' && dailyRoomUrl !== null;
  const isNativeActive = callStatus === 'ACTIVE' && dailyRoomUrl === null;

  if (callStatus === 'IDLE') return null;

  if (isNativeActive) {
    return (
      <Modal visible={true} animationType="fade" transparent={false}>
        <ActiveCallView />
      </Modal>
    );
  }

  if (isWebActive && dailyRoomUrl) {
    const finalUrl = dailyToken ? `${dailyRoomUrl}?t=${dailyToken}` : dailyRoomUrl;
    return (
      <Modal visible={true} animationType="fade" transparent={false}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <GroupCallWebView url={finalUrl} onLeave={endCall} />
        </View>
      </Modal>
    );
  }

  if (!isIncoming && !isDialing && !isWebActive && !isReconnecting) return null;

  const displayInfo = isIncoming
    ? {
      name: incomingCall?.callerInfo.displayName,
      avatar: incomingCall?.callerInfo.avatarUrl,
      type: incomingCall?.callType,
      status: 'Đang gọi tới...'
    }
    : isWebActive
      ? {
        name: peerInfo?.displayName,
        avatar: peerInfo?.avatarUrl,
        type: callType,
        status: 'Đang chuyển hướng sang trình duyệt...'
      }
      : isReconnecting
        ? {
          name: peerInfo?.displayName,
          avatar: peerInfo?.avatarUrl,
          type: callType,
          status: 'Đang kết nối lại...'
        }
        : {
          name: peerInfo?.displayName,
          avatar: peerInfo?.avatarUrl,
          type: callType,
          status: 'Đang kết nối...'
        };

  return (
    <Modal visible={true} animationType="slide" transparent={false}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {displayInfo.type === 'VIDEO' ? 'video' : 'thoại'}
          </Text>
          <Text style={styles.status}>
            {isIncoming ? 'Cuộc gọi đến...' :
              isDialing ? 'Đang gọi...' :
                isReconnecting ? 'Đang kết nối lại...' :
                  isWebActive ? formatDuration(callDuration) : ''}
          </Text>
        </View>

        {isWebActive && (
          <View style={styles.activeIndicator}>
            <Text style={styles.activeText}>Cuộc gọi đang diễn ra</Text>
          </View>
        )}

        <View style={styles.callerInfo}>
          {displayInfo.avatar ? (
            <Avatar.Image size={120} source={{ uri: displayInfo.avatar }} />
          ) : (
            <Avatar.Icon size={120} icon="account" />
          )}
          <Text style={styles.callerName}>{displayInfo.name}</Text>
          <Text style={styles.statusText}>{displayInfo.status}</Text>

          <View style={styles.webHint}>
            <Ionicons name="globe-outline" size={20} color="#8E8E93" />
            <Text style={styles.webHintText}>Cuộc gọi sẽ được mở trong trình duyệt</Text>
          </View>
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + 40 }]}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => {
              if (isIncoming) {
                rejectCall();
              } else { // isDialing or isWebActive
                endCall();
              }
            }}
          >
            <Ionicons name="close" size={32} color="white" />
            <Text style={styles.actionText}>Hủy</Text>
          </TouchableOpacity>

          {isIncoming && (
            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={acceptCall}
            >
              <Ionicons name={incomingCall?.callType === 'VIDEO' ? "globe" : "call"} size={32} color="white" />
              <Text style={styles.actionText}>{incomingCall?.callType === 'VIDEO' ? "Tham gia" : "Chấp nhận"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  title: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  status: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '500',
  },
  callerInfo: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  callerName: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 20,
  },
  activeIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    marginTop: 20,
  },
  activeText: {
    color: '#ddd',
    fontSize: 14,
  },
  statusText: {
    color: '#8E8E93',
    fontSize: 16,
    marginTop: 8,
  },
  webHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  webHintText: {
    color: '#8E8E93',
    fontSize: 12,
    marginLeft: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  acceptButton: {
    backgroundColor: '#007AFF', // Blue for "Open in Web"
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  actionText: {
    color: 'white',
    marginTop: 8,
    fontSize: 14,
    position: 'absolute',
    bottom: -24,
  },
  floatingHangup: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
