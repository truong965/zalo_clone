import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Form, Input, Button, Typography, Space, Alert, Spin, Radio, Divider, message } from 'antd';
import { SafetyOutlined, MobileOutlined, MailOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/use-auth';
import type { TwoFactorRequiredResponse, AuthResponseData } from '@/types/api';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';

const { Title, Text } = Typography;

interface TwoFactorViewProps {
  data: TwoFactorRequiredResponse;
  onSuccess: (authData: AuthResponseData) => void;
  onCancel: () => void;
}

export const TwoFactorView: React.FC<TwoFactorViewProps> = ({ data, onSuccess, onCancel }) => {
  const [method, setMethod] = useState<'TOTP' | 'SMS' | 'EMAIL' | 'PUSH'>(
    (data.preferredMethod as any) || (data.availableMethods.includes('PUSH') ? 'PUSH' : data.availableMethods[0])
  );
  const { verify2fa, send2faSmsChallenge, send2faEmailChallenge, send2faTotpChallenge, send2faPushChallenge, isLoading, error, clearError } = useAuth();
  const [form] = Form.useForm();
  const [pushStatus, setPushStatus] = useState<'IDLE' | 'WAITING' | 'REJECTED' | 'TIMEOUT' | 'VERIFYING'>(
    (data.autoTriggered && (data.preferredMethod === 'PUSH' || (!data.preferredMethod && data.availableMethods.includes('PUSH')))) ? 'WAITING' : 'IDLE'
  );
  const [timeLeft, setTimeLeft] = useState(90); // 90 seconds timeout for PUSH/OTP verification
  const [resendCooldown, setResendCooldown] = useState(data.autoTriggered ? 45 : 0); // 45s cooldown for anti-spam
  const timerRef = useRef<any>(null);
  const cooldownRef = useRef<any>(null);

  // Handle Cooldown Timer (1s ticks)
  useEffect(() => {
    if (resendCooldown > 0) {
      const id = setInterval(() => {
        setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
      return () => clearInterval(id);
    }
  }, [resendCooldown > 0]); // Only re-run when transitions between 0 and >0

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(90); // Reset to 90s
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setPushStatus('TIMEOUT');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Initialize timer for auto-triggered events on mount
  useEffect(() => {
    if (data.autoTriggered) {
      startTimer();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer, data.autoTriggered]);

  // Handle Push Wait Logic (Trigger Only)
  const handlePushWait = useCallback(async () => {
    setPushStatus('WAITING');
    setResendCooldown(45);
    startTimer();

    // Call backend to send Push challenge
    try {
      await send2faPushChallenge(data.pendingToken);
    } catch (err: any) {
      message.error(err.message || 'Không thể gửi yêu cầu phê duyệt');
      setPushStatus('IDLE');
    }
  }, [data.pendingToken, startTimer, send2faPushChallenge]);

  // Centralized Socket Sync Effect
  useEffect(() => {
    if (method !== 'PUSH' || pushStatus !== 'WAITING') {
      return;
    }

    const socket = socketManager.connectUnauthenticated();
    
    // Internal helper to join and setup listeners
    const setup = () => {
      console.log(`[Socket] Subscribing to room: 2fa:${data.pendingToken}`);
      socket.emit(SocketEvents.TWO_FACTOR_SUBSCRIBE, { pendingToken: data.pendingToken });

      const handleApproved = (payload: { pendingToken: string }) => {
        if (payload.pendingToken === data.pendingToken) {
          console.log('[Socket] 2FA APPROVED received, verifying...');
          if (timerRef.current) clearInterval(timerRef.current);
          setPushStatus('VERIFYING');
          
          verify2fa({ pendingToken: data.pendingToken, method: 'PUSH' })
            .then(onSuccess)
            .catch((err) => {
              console.error('[Socket] Auto-verification failed:', err);
              // Don't set back to IDLE, it will loop! Set to TIMEOUT or just keep ERROR
              setPushStatus('TIMEOUT');
               const msg = err.message || 'Xác thực phê duyệt thất bại. Vui lòng thử lại hoặc dùng mã OTP.';
               message.error(msg);
            });
        }
      };

      const handleRejected = (payload: { pendingToken: string }) => {
        if (payload.pendingToken === data.pendingToken) {
          console.log('[Socket] 2fa.rejected received');
          if (timerRef.current) clearInterval(timerRef.current);
          setPushStatus('REJECTED');
          message.warning('Yêu cầu đăng nhập đã bị từ chối trên điện thoại.');
        }
      };

      socket.on(SocketEvents.TWO_FACTOR_APPROVED, handleApproved);
      socket.on(SocketEvents.TWO_FACTOR_REJECTED, handleRejected);

      return () => {
        socket.off(SocketEvents.TWO_FACTOR_APPROVED, handleApproved);
        socket.off(SocketEvents.TWO_FACTOR_REJECTED, handleRejected);
      };
    };

    // Initial setup
    const cleanup = setup();

    // Handle re-subscription if socket reconnects while we are waiting
    const handleReconnect = () => {
      console.log('[Socket] Reconnected, re-subscribing...');
      setup();
    };
    socket.on('connect', handleReconnect);

    return () => {
      cleanup();
      socket.off('connect', handleReconnect);
      if (method !== 'PUSH') {
        setPushStatus('IDLE');
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };
  }, [method, pushStatus, data.pendingToken, verify2fa, onSuccess]);

  useEffect(() => {
    if (method === 'PUSH' && pushStatus === 'IDLE' && !data.autoTriggered) {
      handlePushWait();
    }
  }, [method, pushStatus, handlePushWait, data.autoTriggered]);

  const onFinish = async (values: { code: string }) => {
    try {
      const result = await verify2fa({
        pendingToken: data.pendingToken,
        method,
        code: values.code,
      });
      onSuccess(result);
    } catch (err) {
      // Error handled by useAuth
    }
  };

  const handleRequestChallenge = async () => {
    if (resendCooldown > 0) return;

    try {
      if (method === 'SMS') {
        await send2faSmsChallenge(data.pendingToken);
        message.success(`Mã OTP đã được gửi tới ${data.maskedPhone}`);
      } else if (method === 'EMAIL') {
        await send2faEmailChallenge(data.pendingToken);
        message.success(`Mã OTP đã được gửi tới ${data.maskedEmail}`);
      }
      startTimer(); // Reset the 90s timer on manual resend
      setResendCooldown(45); // Trigger cooldown after manual request
    } catch (err: any) {
      message.error(err.message || 'Không thể gửi mã xác thực. Vui lòng thử lại.');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="two-factor-view py-4">
      <Space direction="vertical" className="w-full" size="middle">
        <div className="flex items-center gap-2 mb-2">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onCancel} disabled={isLoading} />
          <Title level={4} className="!mb-0">
            {data.isReactivation ? 'Kích hoạt lại tài khoản' : 'Xác thực 2 yếu tố'}
          </Title>
        </div>

        <Text type="secondary">
          {data.isReactivation 
            ? 'Tài khoản của bạn hiện đang ở trạng thái tạm khóa. Vui lòng xác thực danh tính để tiếp tục kích hoạt lại tài khoản.'
            : 'Để bảo mật tài khoản, vui lòng xác nhận danh tính của bạn bằng một trong các phương thức sau.'}
        </Text>

        <Radio.Group 
          value={method} 
          onChange={(e) => {
            const newMethod = e.target.value;
            clearError();
            setMethod(newMethod);
            form.resetFields();
            
            // If switching to TOTP, trigger automatically (it doesn't have a specific challenge usually, but we check activation)
            if (newMethod === 'TOTP') {
              send2faTotpChallenge(data.pendingToken).catch(() => {});
              setResendCooldown(45);
            }
          }} 
          buttonStyle="solid"
          className="w-full flex"
          disabled={resendCooldown > 0 || isLoading} 
        >
          {data.availableMethods.includes('PUSH') && (
            <Radio.Button value="PUSH" className="flex-1 text-center">App PUSH</Radio.Button>
          )}
          {data.availableMethods.includes('TOTP') && (
            <Radio.Button value="TOTP" className="flex-1 text-center">Authenticator</Radio.Button>
          )}
          {data.availableMethods.includes('SMS') && (
            <Radio.Button value="SMS" className="flex-1 text-center">SMS OTP</Radio.Button>
          )}
          {data.availableMethods.includes('EMAIL') && (
            <Radio.Button value="EMAIL" className="flex-1 text-center">Email</Radio.Button>
          )}
        </Radio.Group>

        {resendCooldown > 0 && (
          <div className="text-center">
            <Text type="warning" className="text-xs">
              Bạn có thể thay đổi phương thức hoặc gửi lại sau <strong>{resendCooldown}s</strong>
            </Text>
          </div>
        )}

        <Divider className="my-2" />

        {error && <Alert message={error} type="error" showIcon closable className="mb-4" onClose={clearError} />}

        {method === 'PUSH' ? (
          <div className="text-center py-4">
            <Space direction="vertical" align="center" size="middle" className="w-full">
              {['WAITING', 'VERIFYING'].includes(pushStatus) ? (
                <>
                  <Spin size="large" />
                  <div>
                    <Title level={5}>
                      {pushStatus === 'VERIFYING' ? 'Đang xác thực phê duyệt...' : (data.autoTriggered ? 'Đã tự động gửi yêu cầu phê duyệt' : 'Đang chờ xác thực...')}
                    </Title>
                    <Text>Vui lòng mở ứng dụng Zalo trên điện thoại của bạn và chọn "Phê duyệt" để đăng nhập.</Text>
                  </div>
                </>
              ) : pushStatus === 'REJECTED' ? (
                <Alert 
                  type="warning"
                  message="Yêu cầu bị từ chối" 
                  description="Bạn đã từ chối yêu cầu đăng nhập này trên thiết bị di động."
                  className="w-full"
                />
              ) : pushStatus === 'TIMEOUT' ? (
                <Alert 
                  type="error"
                  message="Hết thời gian chờ" 
                  description="Yêu cầu xác thực đã hết hạn. Vui lòng gửi lại yêu cầu."
                  className="w-full"
                />
              ) : (
                <div className="py-4">
                  <SafetyOutlined className="text-5xl text-blue-500 mb-2" />
                  <Title level={5}>Sẵn sàng gửi yêu cầu</Title>
                  <Text>Nhấn nút bên dưới để gửi thông báo phê duyệt tới điện thoại của bạn.</Text>
                </div>
              )}

              {pushStatus !== 'VERIFYING' && (
                <div className="mt-4 w-full">
                  <div className="bg-blue-50 px-4 py-2 rounded-lg text-blue-600 font-mono font-bold mb-4 inline-block">
                    {timeLeft > 0 ? `Hiệu lực còn: ${formatTime(timeLeft)}` : 'Hết thời gian chờ'}
                  </div>
                  
                  <Button 
                    type="primary" 
                    size="large" 
                    block
                    onClick={handlePushWait} 
                    disabled={resendCooldown > 0 || isLoading}
                    loading={isLoading && pushStatus === 'IDLE'}
                  >
                    {resendCooldown > 0 
                      ? `Gửi lại yêu cầu (${resendCooldown}s)` 
                      : (pushStatus === 'IDLE' ? 'Gửi yêu cầu phê duyệt' : 'Gửi lại yêu cầu phê duyệt')}
                  </Button>
                </div>
              )}
            </Space>
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <div className="mb-6 text-center">
              {method === 'TOTP' && (
                <Space direction="vertical" className="w-full">
                  <SafetyOutlined className="text-5xl text-blue-500 mb-2" />
                  <Text className="block mb-4">Nhập mã 6 chữ số từ ứng dụng Google Authenticator hoặc ứng dụng tương tự.</Text>
                  <Button 
                    type="default"
                    onClick={() => {
                      send2faTotpChallenge(data.pendingToken).catch(() => {});
                      setResendCooldown(45);
                    }}
                    disabled={resendCooldown > 0 || isLoading}
                    className="w-full"
                  >
                    {resendCooldown > 0 ? `Thử lại sau ${resendCooldown}s` : 'Lấy mã mới'}
                  </Button>
                </Space>
              )}
              {method === 'SMS' && (
                <Space direction="vertical" className="w-full">
                  <MobileOutlined className="text-5xl text-green-500 mb-2" />
                  <Text className="block">Mã OTP sẽ được gửi tới số điện thoại: <strong>{data.maskedPhone}</strong></Text>
                  <Button 
                    type="primary"
                    ghost
                    onClick={handleRequestChallenge}
                    disabled={resendCooldown > 0 || isLoading}
                    className="mt-4 w-full"
                  >
                    {resendCooldown > 0 ? `Gửi lại mã sau ${resendCooldown}s` : 'Gửi mã xác thực qua SMS'}
                  </Button>
                </Space>
              )}
              {method === 'EMAIL' && (
                <Space direction="vertical" className="w-full">
                  <MailOutlined className="text-5xl text-orange-500 mb-2" />
                  <Text className="block">Mã OTP sẽ được gửi tới email: <strong>{data.maskedEmail}</strong></Text>
                  <Button 
                    type="primary"
                    ghost
                    onClick={handleRequestChallenge}
                    disabled={resendCooldown > 0 || isLoading}
                    className="mt-4 w-full"
                  >
                    {resendCooldown > 0 ? `Gửi lại mã sau ${resendCooldown}s` : 'Gửi mã xác thực qua Email'}
                  </Button>
                </Space>
              )}
            </div>

            <Form.Item
              name="code"
              rules={[
                { required: true, message: 'Vui lòng nhập mã xác thực' },
                { pattern: /^[0-9]{5,6}$/, message: 'Mã xác thực không hợp lệ' }
              ]}
            >
              <Input 
                placeholder="000000" 
                maxLength={6} 
                size="large" 
                className="text-center text-3xl font-mono"
                autoFocus
                disabled={isLoading}
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" block size="large" loading={isLoading}>
                Xác nhận
              </Button>
            </Form.Item>
          </Form>
        )}
      </Space>
    </div>
  );
};
