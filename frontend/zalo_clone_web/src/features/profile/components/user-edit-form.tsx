// src/features/users/components/user-edit-form.tsx
import { Form, Input, Radio, DatePicker, Button } from 'antd';
import type { User } from '@/types/api';
import { Gender } from '@/types/api';
import dayjs from 'dayjs';

interface UserEditFormProps {
      user: User;
      onCancel: () => void;
      onSave: (values: any) => void;
      loading?: boolean;
}

export function UserEditForm({ user, onCancel, onSave, loading }: UserEditFormProps) {
      const [form] = Form.useForm();

      // Map data từ user vào form
      const initialValues = {
            displayName: user.displayName,
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
                                    label="Tên hiển thị"
                                    name="displayName"
                                    rules={[{ required: true, message: 'Vui lòng nhập tên hiển thị' }]}
                              >
                                    <Input placeholder="Nhập tên hiển thị" />
                              </Form.Item>

                              {/* Giới tính - Dùng Radio giống ảnh mẫu */}
                              <Form.Item label="Thông tin cá nhân" className="mb-2">
                                    <Form.Item name="gender" className="mb-0">
                                          <Radio.Group className="flex gap-8">
                                                <Radio value={Gender.MALE}>Nam</Radio>
                                                <Radio value={Gender.FEMALE}>Nữ</Radio>
                                                <Radio value={Gender.OTHER}>Khác</Radio>
                                          </Radio.Group>
                                    </Form.Item>
                              </Form.Item>

                              {/* Ngày sinh - Dùng DatePicker cho tiện thay vì 3 select box */}
                              <Form.Item
                                    label="Ngày sinh"
                                    name="dateOfBirth"
                              >
                                    <DatePicker
                                          format="DD/MM/YYYY"
                                          className="w-full"
                                          placeholder="Chọn ngày sinh"
                                    />
                              </Form.Item>
                        </Form>
                  </div>

                  {/* Footer Actions */}
                  <div className="p-4 border-t border-gray-100 flex gap-3 justify-end bg-gray-50">
                        <Button size="large" onClick={onCancel}>
                              Hủy
                        </Button>
                        <Button
                              type="primary"
                              size="large"
                              onClick={() => form.submit()}
                              loading={loading}
                              className="bg-blue-600"
                        >
                              Cập nhật
                        </Button>
                  </div>
            </div>
      );
}