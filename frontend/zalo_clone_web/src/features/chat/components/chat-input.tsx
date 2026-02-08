import { Input, Button, Tooltip } from 'antd';
import {
      SmileOutlined,
      PictureOutlined,
      PaperClipOutlined,
      EllipsisOutlined,
      SendOutlined,
      IdcardOutlined,
      FormatPainterOutlined,
      SnippetsOutlined
} from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';

const { TextArea } = Input;

interface ChatInputProps {
      conversationId: string | null;
      onSend?: (text: string) => void;
      onTypingChange?: (isTyping: boolean) => void;
}

export function ChatInput({ conversationId, onSend, onTypingChange }: ChatInputProps) {
      const [message, setMessage] = useState('');

      const isTypingRef = useRef(false);
      const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      useEffect(() => {
            return () => {
                  if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
            };
      }, []);

      // Danh sách các công cụ trên Toolbar
      const toolbarActions = [
            { icon: <SmileOutlined />, label: 'Gửi Sticker', key: 'sticker' },
            { icon: <PictureOutlined />, label: 'Gửi hình ảnh', key: 'image' },
            { icon: <PaperClipOutlined />, label: 'Đính kèm file', key: 'file' },
            { icon: <IdcardOutlined />, label: 'Gửi danh thiếp', key: 'contact' },
            { icon: <SnippetsOutlined />, label: 'Chụp màn hình', key: 'screenshot' },
            { icon: <FormatPainterOutlined />, label: 'Định dạng văn bản', key: 'format' },
            { icon: <EllipsisOutlined />, label: 'Tiện ích khác', key: 'more' },
      ];

      return (
            <div className="bg-white border-t border-gray-200">

                  {/* 1. TOOLBAR (Hàng trên) */}
                  <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-50">
                        {toolbarActions.map((action) => (
                              <Tooltip title={action.label} key={action.key} placement="top">
                                    <Button
                                          type="text"
                                          icon={action.icon}
                                          className="text-gray-600 hover:bg-gray-100 hover:text-blue-600 rounded"
                                          size="middle"
                                    />
                              </Tooltip>
                        ))}
                  </div>

                  {/* 2. INPUT AREA (Hàng dưới) */}
                  <div className="p-3 flex items-end gap-2">
                        {/* Text Area */}
                        <div className="flex-1 relative">
                              <TextArea
                                    value={message}
                                    onChange={(e) => {
                                          const next = e.target.value;
                                          setMessage(next);

                                          if (!conversationId) return;
                                          if (!onTypingChange) return;

                                          if (!isTypingRef.current) {
                                                isTypingRef.current = true;
                                                onTypingChange(true);
                                          }

                                          if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
                                          stopTimerRef.current = setTimeout(() => {
                                                if (!isTypingRef.current) return;
                                                isTypingRef.current = false;
                                                onTypingChange(false);
                                          }, 1200);
                                    }}
                                    placeholder={conversationId ? 'Nhập tin nhắn' : 'Chọn một cuộc trò chuyện để bắt đầu'}
                                    autoSize={{ minRows: 1, maxRows: 5 }}
                                    className="!bg-transparent !resize-none pr-8 text-[15px]"
                                    variant="borderless"
                                    disabled={!conversationId}
                                    onBlur={() => {
                                          if (!conversationId) return;
                                          if (!onTypingChange) return;
                                          if (!isTypingRef.current) return;
                                          isTypingRef.current = false;
                                          onTypingChange(false);
                                    }}
                                    onPressEnter={(e) => {
                                          if (!e.shiftKey) {
                                                e.preventDefault();
                                                if (!conversationId) return;
                                                const text = message.trim();
                                                if (!text) return;
                                                if (onTypingChange && isTypingRef.current) {
                                                      isTypingRef.current = false;
                                                      onTypingChange(false);
                                                }
                                                onSend?.(text);
                                                setMessage('');
                                          }
                                    }}
                              />
                        </div>

                        {/* Action Buttons Right Side */}
                        <div className="flex items-center gap-2 pb-1">
                              {/* Icon Face (Biểu cảm) */}
                              <Tooltip title="Biểu cảm">
                                    <Button
                                          type="text"
                                          icon={<SmileOutlined className="text-xl text-gray-500" />}
                                          className="hover:bg-gray-100 hover:text-yellow-500 rounded-full w-8 h-8 flex items-center justify-center"
                                    />
                              </Tooltip>

                              {/* Nút Gửi (Thay thế icon Like) */}
                              <div className="border-l border-gray-200 pl-2">
                                    <Tooltip title="Gửi tin nhắn (Enter)">
                                          <Button
                                                type="text"
                                                disabled={!conversationId || !message.trim()} // Disable nếu không có conversation hoặc text
                                                icon={
                                                      <SendOutlined
                                                            className={`text-xl ${message.trim() ? 'text-blue-600' : 'text-gray-400'}`}
                                                            rotate={-45} // Xoay nhẹ icon send cho giống Telegram/Zalo mới
                                                      />
                                                }
                                                className="hover:bg-blue-50 w-10 h-10 flex items-center justify-center rounded-lg"
                                                onClick={() => {
                                                      if (!conversationId) return;
                                                      const text = message.trim();
                                                      if (!text) return;
                                                      if (onTypingChange && isTypingRef.current) {
                                                            isTypingRef.current = false;
                                                            onTypingChange(false);
                                                      }
                                                      onSend?.(text);
                                                      setMessage('');
                                                }}
                                          />
                                    </Tooltip>
                              </div>
                        </div>
                  </div>

            </div>
      );
}