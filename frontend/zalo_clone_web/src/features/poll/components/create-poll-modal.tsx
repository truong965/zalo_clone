import { useEffect, useState } from 'react';
import { Modal, Input, Switch, Button, message } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
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
      const { t } = useTranslation();
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
                  void message.warning(t('poll.create.maxOptions', { max: 12 }));
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
                  void message.warning(t('poll.create.errorNoQuestion'));
                  return;
            }
            if (trimmedOptions.length < MIN_OPTIONS) {
                  void message.warning(t('poll.create.errorMinOptions', { min: MIN_OPTIONS }));
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
                  void message.success(t('poll.create.success'));
            } catch {
                  // global handler
            }
      };

      return (
            <Modal
                  title={t('poll.create.title')}
                  open={open}
                  onCancel={onClose}
                  onOk={() => void handleOk()}
                  okText={t('poll.create.submit')}
                  cancelText={t('poll.create.cancel')}
                  confirmLoading={isSubmitting}
                  destroyOnHidden
                  width={480}
            >
                  <div className="flex flex-col gap-4 py-2">
                        <div>
                              <label className="block text-sm font-medium text-gray-600 mb-1">
                                    {t('poll.create.questionLabel')}
                              </label>
                              <Input.TextArea
                                    rows={2}
                                    maxLength={500}
                                    placeholder={t('poll.create.questionPlaceholder')}
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                              />
                        </div>

                        <div>
                              <label className="block text-sm font-medium text-gray-600 mb-2">
                                    {t('poll.create.optionsLabel')}
                              </label>
                              <div className="space-y-2">
                                    {options.map((opt, index) => (
                                          <div key={index} className="flex gap-2">
                                                <Input
                                                      placeholder={t('poll.create.optionPlaceholder', { index: index + 1 })}
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
                                    {t('poll.create.addOption')}
                              </Button>
                        </div>

                        <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">{t('poll.create.multipleChoices')}</span>
                              <Switch
                                    checked={isMultipleChoices}
                                    onChange={setIsMultipleChoices}
                              />
                        </div>

                        <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">{t('poll.create.allowAddOptions')}</span>
                              <Switch checked={allowAddOptions} onChange={setAllowAddOptions} />
                        </div>
                  </div>
            </Modal>
      );
}
