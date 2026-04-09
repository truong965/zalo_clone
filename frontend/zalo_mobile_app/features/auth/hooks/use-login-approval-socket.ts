import { useEffect } from 'react';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import { useLoginApprovalStore } from '../stores/login-approval.store';
import { useAuth } from '@/providers/auth-provider';

export function useLoginApprovalSocket() {
  const { user } = useAuth();
  const { showRequest } = useLoginApprovalStore();

  useEffect(() => {
    if (!user) return;

    // We use the authenticated socket which is already connected 
    // and joined to the user's private room.
    const socket = socketManager.getSocket();
    if (!socket) return;

    const handleLoginRequest = (data: any) => {
      console.log('[Socket] Incoming login approval request:', data);
      showRequest({
        pendingToken: data.pendingToken,
        deviceName: data.deviceName,
        location: data.location,
        ipAddress: data.ipAddress,
        timestamp: data.timestamp,
      });
    };

    socket.on(SocketEvents.LOGIN_APPROVAL_REQUEST, handleLoginRequest);

    return () => {
      socket.off(SocketEvents.LOGIN_APPROVAL_REQUEST, handleLoginRequest);
    };
  }, [user, showRequest]);
}
