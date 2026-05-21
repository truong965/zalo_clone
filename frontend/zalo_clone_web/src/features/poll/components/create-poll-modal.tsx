import { useEffect, useState } from 'react';
import { Modal, Input, Switch, Button, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { CreatePollParams } from '@/types/api';

const MIN_OPTIONS = 2;

interface CreatePollModalProps {
      open: boolean;
      onClose: () => void;
      conversationId: string | null;
      onSubmit: (params: CreatePollParams) => Promise<unknown>;
      isSubmitting?: boolean;
}

export function CreatePollModal({
      open,
      onClose,
      conversationId,
      onSubmit,
      isSubmitting = false,
}: CreatePollModalProps) {
      const [question, setQuestion] = useState('');
      const [options, setOptions] = useState(['', '']);
      const [isMultipleChoices, setIsMultipleChoices] = useState(false);
      const [allowAddOptions, setAllowAddOptions] = useState(false);

      useEffect(() => {
            if (!open) return;
            setQuestion('');
            setOptions(['', '']);
            setIsMultipleChoices(false);
            setAllowAddOptions(false);
      }, [open]);

      const handleAddOption = () => {
            if (options.length >= 12) {
                  message.warning('Tối đa 12 phương án');
                  return;
            }
            setOptions((prev) => [...prev, '']);
      };

      const handleRemoveOption = (index: number) => {
            if (options.length <= MIN_OPTIONS) return;
            setOptions((prev) => prev.filter((_, i) => i !== index));
      };

      const handleOk = async () => {
            if (!conversationId) return;
            const trimmedQuestion = question.trim();
            const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);

            if (!trimmedQuestion) {
                  message.warning('Vui lòng nhập câu hỏi');
                  return;
            }
            if (trimmedOptions.length < MIN_OPTIONS) {
                  message.warning(`Cần ít nhất ${MIN_OPTIONS} phương án`);
                  return;
            }

            try {
                  await onSubmit({
                        conversationId,
                        question: trimmedQuestion,
                        options: trimmedOptions,
                        isMultipleChoices,
                        allowAddOptions,
                  });
                  onClose();
                  message.success('Đã tạo bình chọn');
            } catch {
                  // global handler
            }
      };

      return (
            <Modal
                  title="Tạo bình chọn"
                  open={open}
                  onCancel={onClose}
                  onOk={() => void handleOk()}
                  okText="Tạo"
                  cancelText="Hủy"
                  confirmLoading={isSubmitting}
                  destroyOnHidden
                  width={480}
            >
                  <div className="flex flex-col gap-4 py-2">
                        <div>
                              <label className="block text-sm font-medium text-gray-600 mb-1">
                                    Câu hỏi
                              </label>
                              <Input.TextArea
                                    rows={2}
                                    maxLength={500}
                                    placeholder="Nhập câu hỏi bình chọn"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                              />
                        </div>

                        <div>
                              <label className="block text-sm font-medium text-gray-600 mb-2">
                                    Phương án
                              </label>
                              <div className="space-y-2">
                                    {options.map((opt, index) => (
                                          <div key={index} className="flex gap-2">
                                                <Input
                                                      placeholder={`Phương án ${index + 1}`}
                                                      maxLength={200}
                                                      value={opt}
                                                      onChange={(e) => {
                                                            const next = [...options];
                                                            next[index] = e.target.value;
                                                            setOptions(next);
                                                      }}
                                                />
                                                {options.length > MIN_OPTIONS && (
                                                      <Button
                                                            type="text"
                                                            danger
                                                            icon={<MinusCircleOutlined />}
                                                            onClick={() => handleRemoveOption(index)}
                                                      />
                                                )}
                                          </div>
                                    ))}
                              </div>
                              <Button
                                    type="dashed"
                                    block
                                    className="mt-2"
                                    icon={<PlusOutlined />}
                                    onClick={handleAddOption}
                              >
                                    Thêm phương án
                              </Button>
                        </div>

                        <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Chọn nhiều phương án</span>
                              <Switch
                                    checked={isMultipleChoices}
                                    onChange={setIsMultipleChoices}
                              />
                        </div>

                        <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Có thể thêm phương án mới</span>
                              <Switch checked={allowAddOptions} onChange={setAllowAddOptions} />
                        </div>
                  </div>
            </Modal>
      );
}
