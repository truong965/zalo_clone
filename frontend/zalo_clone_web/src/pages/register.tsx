import { Form, Input, Button, Card, Space, Typography, Divider, notification, Select, Steps } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, SafetyCertificateOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/features/auth';
import { ROUTES } from '@/config/routes';
import { ApiError } from '@/lib/api-error';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

const { Title, Text } = Typography;

export function RegisterPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [api, contextHolder] = notification.useNotification();
  const { t } = useTranslation();

  const { 
    register, 
    requestRegisterOtp, 
    verifyRegisterOtp, 
    isLoading, 
    isAuthenticated, 
    clearError 
  } = useAuth();

  // Step Management: 1: Phone, 2: OTP, 3: Profile
  const [step, setStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('');
  
  // Countdown Timer
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.CHAT);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAuthenticated, navigate]);

  const startCountdown = () => {
    setCountdown(45);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Step 1: Request OTP
  const handleRequestOtp = async () => {
    try {
      const values = await form.validateFields(['phoneNumber']);
      await requestRegisterOtp({ phoneNumber: values.phoneNumber });
      setPhoneNumber(values.phoneNumber);
      setStep(2);
      startCountdown();
      api.success({
        message: t('auth.register.otpSentTitle', 'Mã OTP đã gửi'),
        description: t('auth.register.otpSentDesc', 'Vui lòng kiểm tra tin nhắn Telegram/SMS.'),
      });
    } catch (err: any) {
      if (err.errorFields) return; // Form validation error
      api.error({
        message: t('auth.register.failTitle'),
        description: ApiError.from(err).message || t('auth.register.failDesc'),
      });
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    try {
      const values = await form.validateFields(['otp']);
      await verifyRegisterOtp({ phoneNumber, otp: values.otp });
      setStep(3);
      api.success({
        message: t('auth.register.otpVerifySuccess', 'Xác thực thành công'),
        description: t('auth.register.otpVerifySuccessDesc', 'Vui lòng hoàn tất thông tin cá nhân.'),
      });
    } catch (err: any) {
      if (err.errorFields) return;
      api.error({
        message: t('auth.register.failTitle'),
        description: ApiError.from(err).message || t('auth.register.otpInvalid', 'Mã OTP không chính xác.'),
      });
    }
  };

  // Step 3: Complete Register
  const onFinish = async (values: any) => {
    try {
      clearError();
      await register({
        displayName: values.displayName,
        phoneNumber,
        password: values.password,
        gender: values.gender,
        dateOfBirth: values.dateOfBirth,
      });
      api.success({
        message: t('auth.register.successTitle'),
        description: t('auth.register.successDesc'),
        duration: 5,
      });
      setTimeout(() => navigate(ROUTES.LOGIN), 1500);
    } catch (err: unknown) {
      api.error({
        message: t('auth.register.failTitle'),
        description: ApiError.from(err).message || t('auth.register.failDesc'),
      });
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Form.Item
              label={t('auth.register.phoneLabel')}
              name="phoneNumber"
              rules={[
                { required: true, message: t('auth.register.phoneRequired') },
                { pattern: /^((\+84)|(84)|0)\d{9}$/, message: t('auth.register.phoneInvalid') },
              ]}
            >
              <Input prefix={<PhoneOutlined />} placeholder={t('auth.register.phonePlaceholder')} />
            </Form.Item>
            <Button type="primary" block size="large" onClick={handleRequestOtp} loading={isLoading}>
              {t('auth.register.sendOtp', 'Nhận mã kích hoạt')}
            </Button>
          </motion.div>
        );
      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <div className="mb-4">
              <Button 
                type="link" 
                icon={<ArrowLeftOutlined />} 
                onClick={() => setStep(1)} 
                className="p-0 h-auto mb-2"
              >
                {t('common.back', 'Quay lại')}
              </Button>
              <div>
                <Text type="secondary">Mã xác thực đã được gửi tới số: </Text>
                <Text strong>{phoneNumber}</Text>
              </div>
            </div>

            <Form.Item
              label={t('auth.register.otpLabel', 'Mã xác thực (OTP)')}
              name="otp"
              rules={[{ required: true, message: t('auth.register.otpRequired', 'Vui lòng nhập mã OTP') }]}
            >
              <Input 
                prefix={<SafetyCertificateOutlined />} 
                placeholder="6 chữ số" 
                maxLength={6} 
                className="text-center text-lg tracking-widest font-bold"
              />
            </Form.Item>

            <Space direction="vertical" className="w-full" size="middle">
              <Button type="primary" block size="large" onClick={handleVerifyOtp} loading={isLoading}>
                {t('auth.register.verifyOtp', 'Tiếp tục')}
              </Button>
              
              <div className="text-center">
                {countdown > 0 ? (
                  <Text type="secondary">
                    Gửi lại mã sau <Text strong className="text-blue-500">{countdown}s</Text>
                  </Text>
                ) : (
                  <Button type="link" onClick={handleRequestOtp} loading={isLoading}>
                    Gửi lại mã xác thực
                  </Button>
                )}
              </div>
            </Space>
          </motion.div>
        );
      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <Form.Item
              label={t('auth.register.displayNameLabel')}
              name="displayName"
              rules={[{ required: true, message: t('auth.register.displayNameRequired') }]}
            >
              <Input prefix={<UserOutlined />} placeholder={t('auth.register.displayNamePlaceholder')} />
            </Form.Item>

            <Form.Item
              label={t('auth.register.passwordLabel')}
              name="password"
              rules={[{ required: true, message: t('auth.register.passwordRequired') }, { min: 6, message: t('auth.register.passwordMin') }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder={t('auth.register.passwordPlaceholder')} />
            </Form.Item>

            <Form.Item
              label={t('auth.register.confirmPasswordLabel')}
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: t('auth.register.confirmPasswordRequired') },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve();
                    return Promise.reject(new Error(t('auth.register.confirmPasswordMatch')));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder={t('auth.register.confirmPasswordPlaceholder')} />
            </Form.Item>

            <div className="grid grid-cols-2 gap-4">
              <Form.Item label={t('auth.register.genderLabel')} name="gender" className="mb-0">
                <Select placeholder={t('auth.register.genderPlaceholder')}>
                  <Select.Option value="MALE">{t('auth.register.male')}</Select.Option>
                  <Select.Option value="FEMALE">{t('auth.register.female')}</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item label={t('auth.register.dobLabel')} name="dateOfBirth" className="mb-0">
                <Input type="date" max={new Date().toISOString().split('T')[0]} />
              </Form.Item>
            </div>

            <Form.Item className="mt-8 mb-0">
              <Button type="primary" htmlType="submit" block size="large" loading={isLoading}>
                {t('auth.register.submit')}
              </Button>
            </Form.Item>
          </motion.div>
        );
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-50 flex justify-center overflow-y-auto py-10 px-4">
      {contextHolder}

      <div className="w-full max-w-md h-fit">
        <Card className="shadow-lg w-full border-none sm:border-solid">
          <Space direction="vertical" className="w-full" size="large">
            <div className="text-center">
              <Title level={2} className="!mb-2">{t('auth.register.title')}</Title>
              <Text type="secondary">{t('auth.register.subtitle')}</Text>
            </div>

            <Steps 
              current={step - 1} 
              size="small" 
              className="mb-6"
              items={[
                { title: 'SĐT' },
                { title: 'Xác thực' },
                { title: 'Thông tin' },
              ]}
            />

            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              requiredMark="optional"
              size="large"
            >
              <AnimatePresence mode="wait">
                {renderStep()}
              </AnimatePresence>
            </Form>

            {step === 1 && (
              <>
                <Divider className="my-2">{t('auth.register.or')}</Divider>
                <div className="text-center pb-2">
                  <Text>{t('auth.register.haveAccount')} </Text>
                  <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
                    {t('auth.register.loginNow')}
                  </Link>
                </div>
              </>
            )}
          </Space>
        </Card>
      </div>
    </div>
  );
}