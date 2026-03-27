// src/features/users/components/user-edit-form.tsx
import { Form, Input, Radio, DatePicker, Button } from 'antd';
import type { User } from '@/types/api';
import { Gender } from '@/types/api';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

interface UserEditFormProps {
      user: User;
      onCancel: () => void;
      onSave: (values: any) => void;
      loading?: boolean;
}

export function UserEditForm({ user, onCancel, onSave, loading }: UserEditFormProps) {
      const [form] = Form.useForm();
      const { t } = useTranslation();

      // Map data từ user vào form
      const initialValues = {
            displayName: user.displayName,
            email: user.email,
            gender: user.gender || Gender.MALE,
            dateOfBirth: user.dateOfBirth ? dayjs(user.dateOfBirth) : null,
      };

      const handleSubmit = (values: any) => {
            // Convert dayjs back to Date/String if needed by API
            onSave({
                  ...values,
                  dateOfBirth: values.dateOfBirth ? values.dateOfBirth.toISOString() : null
            });
      };

      return (
            <div className="flex flex-col h-full pt-4">
                  <div className="flex-1 px-4">
                        <Form
                              form={form}
                              layout="vertical"
                              initialValues={initialValues}
                              onFinish={handleSubmit}
                              size="large"
                        >
                              {/* Tên hiển thị */}
                              <Form.Item
                                    label={t('profile.formDisplayName')}
                                    name="displayName"
                                    rules={[{ required: true, message: t('profile.formDisplayNameRequired') }]}
                              >
                                    <Input placeholder={t('profile.formDisplayNamePlaceholder')} />
                              </Form.Item>

                              {/* Email */}
                              <Form.Item
                                    label={t('profile.formEmail')}
                                    name="email"
                                    rules={[
                                          { type: 'email', message: t('profile.formEmailInvalid') },
                                          {
                                                validator: (_, value) => {
                                                      if (!value || value.endsWith('@gmail.com')) {
                                                            return Promise.resolve();
                                                      }
                                                      return Promise.reject(new Error(t('profile.formEmailGmailOnly')));
                                                },
                                          },
                                    ]}
                              >
                                    <Input placeholder={t('profile.formEmailPlaceholder')} />
                              </Form.Item>

                              {/* Giới tính - Dùng Radio giống ảnh mẫu */}
                              <Form.Item label={t('profile.formPersonalInfo')} className="mb-2">
                                    <Form.Item name="gender" className="mb-0">
                                          <Radio.Group className="flex gap-8">
                                                <Radio value={Gender.MALE}>{t('profile.genderMale')}</Radio>
                                                <Radio value={Gender.FEMALE}>{t('profile.genderFemale')}</Radio>
                                                <Radio value={Gender.OTHER}>{t('profile.genderOther')}</Radio>
                                          </Radio.Group>
                                    </Form.Item>
                              </Form.Item>

                              {/* Ngày sinh - Dùng DatePicker cho tiện thay vì 3 select box */}
                              <Form.Item
                                    label={t('profile.formDob')}
                                    name="dateOfBirth"
                              >
                                    <DatePicker
                                          format="DD/MM/YYYY"
                                          className="w-full"
                                          placeholder={t('profile.formDobPlaceholder')}
                                    />
                              </Form.Item>
                        </Form>
                  </div>

                  {/* Footer Actions */}
                  <div className="p-4 border-t border-gray-100 flex gap-3 justify-end bg-gray-50">
                        <Button size="large" onClick={onCancel}>
                              {t('profile.formCancel')}
                        </Button>
                        <Button
                              type="primary"
                              size="large"
                              onClick={() => form.submit()}
                              loading={loading}
                              className="bg-blue-600"
                        >
                              {t('profile.formSave')}
                        </Button>
                  </div>
            </div>
      );
}