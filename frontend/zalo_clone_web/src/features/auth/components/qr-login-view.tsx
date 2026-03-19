import React, { useEffect, useState, useRef, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Typography, Button, Spin, Result } from 'antd';
import { SyncOutlined, CheckCircleOutlined, MobileOutlined } from '@ant-design/icons';
import { authService } from '../api/auth.service';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import { ApiError } from '@/lib/api-error';
import { useTranslation } from 'react-i18next';

const { Text, Title } = Typography;

interface QrLoginViewProps {
  onLoginSuccess: () => void;
  onError: (errorMsg: string) => void;
}

type QrState = 'LOADING' | 'PENDING' | 'SCANNED' | 'EXPIRED';

const QR_TIMEOUT_MS = 60 * 1000; // 1 minute

export const QrLoginView: React.FC<QrLoginViewProps> = ({ onLoginSuccess, onError }) => {
  const [qrState, setQrState] = useState<QrState>('LOADING');
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { t } = useTranslation();

  // ── Refs to avoid stale closures in socket event handlers ──
  const qrSessionIdRef = useRef<string | null>(null);
  const deviceTrackingIdRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const disconnectPublicSocketIfConnected = useCallback(() => {
    const socket = socketManager.getSocket();
    if (!socket) {
      return;
    }

    const auth = socket.auth as { token?: string } | undefined;
    const isPublicSocket = !auth?.token;
    if (isPublicSocket && socket.connected) {
      socketManager.disconnect();
    }
  }, []);

  const startExpirationTimer = useCallback(() => {
    clearTimer();
    const endTime = Date.now() + QR_TIMEOUT_MS;

    timerIntervalRef.current = setInterval(() => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        clearTimer();
        setQrState('EXPIRED');
        const socket = socketManager.getSocket();
        if (socket) {
          socket.off('connect');
          socket.off(SocketEvents.QR_SCANNED);
          socket.off(SocketEvents.QR_APPROVED);
          socket.off(SocketEvents.QR_CANCELLED);
        }
      }
    }, 1000);
  }, [clearTimer]);

  /**
   * Remove all QR-related socket listeners before (re-)registering.
   * Prevents duplicate handlers when generateAndConnect is called multiple times.
   */
  const cleanupSocketListeners = useCallback(() => {
    const socket = socketManager.getSocket();
    if (socket) {
      socket.off('connect');
      socket.off(SocketEvents.QR_SCANNED);
      socket.off(SocketEvents.QR_APPROVED);
      socket.off(SocketEvents.QR_CANCELLED);
    }
  }, []);

  const generateAndConnect = useCallback(async () => {
    try {
      setQrState('LOADING');
      clearTimer();

      // Clean up old listeners before adding new ones (prevents listener leak)
      cleanupSocketListeners();

      // 1. Connect unauthenticated socket
      const socket = socketManager.connectUnauthenticated();

      const handleConnect = async () => {
        try {
          if (!socket.id) throw new Error('No socket ID');
          // 2. Generate QR session with socketId
          const res = await authService.generateQr(socket.id);

          // Store in both state (for rendering) AND ref (for event handlers)
          setQrSessionId(res.qrSessionId);
          qrSessionIdRef.current = res.qrSessionId;
          deviceTrackingIdRef.current = res.deviceTrackingId;

          setQrState('PENDING');
          startExpirationTimer();
        } catch (err) {
          onError(ApiError.from(err).message || t('auth.qr.qrError'));
          setQrState('EXPIRED');
        }
      };

      if (socket.connected) {
        await handleConnect();
      } else {
        socket.once('connect', handleConnect);
      }

      // 3. Listen to QR events
      socket.on(SocketEvents.QR_SCANNED, () => {
        setQrState('SCANNED');
      });

      socket.on(SocketEvents.QR_CANCELLED, () => {
        clearTimer();
        // Automatically reload a new QR code
        generateAndConnect();
      });

      socket.on(SocketEvents.QR_APPROVED, async (data: { ticket: string; qrSessionId: string }) => {
        try {
          // Use qrSessionId from event data (avoids stale closure)
          // Fall back to ref if event doesn't include it
          const sessionId = data.qrSessionId || qrSessionIdRef.current;
          const deviceId = deviceTrackingIdRef.current;
          if (!sessionId) return;

          await authService.exchangeQrTicket(data.ticket, sessionId, deviceId ?? undefined);
          clearTimer();
          onLoginSuccess();
        } catch (err) {
          onError(ApiError.from(err).message || t('auth.qr.authFail'));
          setQrState('EXPIRED');
        }
      });

    } catch (err) {
      onError(ApiError.from(err).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    generateAndConnect();

    return () => {
      clearTimer();
      cleanupSocketListeners();
      disconnectPublicSocketIfConnected();
    };
  }, [clearTimer, cleanupSocketListeners, disconnectPublicSocketIfConnected, generateAndConnect]);

  const renderContent = () => {
    if (qrState === 'LOADING') {
      return (
        <div className="flex flex-col items-center justify-center py-10 min-h-[250px]">
          <Spin size="large" />
          <Text className="mt-4 text-gray-500">{t('auth.qr.loading')}</Text>
        </div>
      );
    }

    if (qrState === 'EXPIRED') {
      return (
        <Result
          status="warning"
          title={t('auth.qr.expiredTitle')}
          subTitle={t('auth.qr.expiredDesc')}
          extra={
            <Button type="primary" icon={<SyncOutlined />} onClick={generateAndConnect}>
              {t('auth.qr.reload')}
            </Button>
          }
        />
      );
    }

    if (qrState === 'SCANNED') {
      return (
        <div className="flex flex-col items-center justify-center py-10 min-h-[250px]">
          <CheckCircleOutlined className="text-6xl text-green-500 mb-4" />
          <Title level={4}>{t('auth.qr.scannedTitle')}</Title>
          <Text className="text-gray-500 text-center">
            {t('auth.qr.scannedDesc')}
          </Text>
        </div>
      );
    }

    // PENDING state
    // Deep link scheme expected by mobile app
    const qrValue = `zalo-clone://login?session=${qrSessionId}`;

    return (
      <div className="flex flex-col items-center py-6">
        <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
          {qrSessionId ? (
            <QRCodeCanvas value={qrValue} size={220} level="H" />
          ) : (
            <div className="w-[220px] h-[220px] bg-gray-100 animate-pulse rounded-lg flex items-center justify-center">
              <Spin />
            </div>
          )}
        </div>

        <div className="flex items-center text-gray-600 bg-gray-50 px-4 py-3 rounded-lg w-full">
          <MobileOutlined className="text-2xl text-blue-500 mr-3" />
          <div className="flex flex-col">
            <Text strong>{t('auth.qr.useApp')}</Text>
            <Text className="text-sm">{t('auth.qr.scanInstruction')}</Text>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {renderContent()}
    </div>
  );
};
