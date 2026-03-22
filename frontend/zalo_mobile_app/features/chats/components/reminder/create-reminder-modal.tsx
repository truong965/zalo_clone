import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Modal, Portal, TextInput, Button, useTheme } from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { CreateReminderParams } from '@/types/reminder';

interface CreateReminderModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSubmit: (params: CreateReminderParams) => Promise<void>;
  conversationId?: string | null;
  messageId?: string | null;
  defaultContent?: string;
}

export function CreateReminderModal({
  visible,
  onDismiss,
  onSubmit,
  conversationId,
  messageId,
  defaultContent = '',
}: CreateReminderModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [content, setContent] = useState(defaultContent);
  const [date, setDate] = useState(new Date(Date.now() + 10 * 60 * 1000)); // Default 10 mins from now
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(date);
      newDate.setFullYear(selectedDate.getFullYear());
      newDate.setMonth(selectedDate.getMonth());
      newDate.setDate(selectedDate.getDate());
      setDate(newDate);
      if (Platform.OS === 'android') setShowTimePicker(true);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(date);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setDate(newDate);
    }
  };

  const isInvalidDate = dayjs(date).isBefore(dayjs().add(1, 'minute'));

  const handleOk = async () => {
    if (!content.trim()) return;
    if (isInvalidDate) {
      Toast.show({
        type: 'error',
        text1: 'Thời gian không hợp lệ',
        text2: 'Vui lòng chọn thời gian nhắc hẹn ít nhất 1 phút từ hiện tại',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        content: content.trim(),
        remindAt: date.toISOString(),
        ...(conversationId ? { conversationId } : {}),
        ...(messageId ? { messageId } : {}),
      });
      onDismiss();
    } catch (error) {
      console.error('Failed to create reminder:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: theme.colors.elevation.level3,
          padding: 20,
          margin: 20,
          borderRadius: 12,
        }}
      >
        <Text className="text-xl font-bold mb-4 text-foreground">Tạo nhắc hẹn</Text>

        <TextInput
          label="Nội dung"
          value={content}
          onChangeText={setContent}
          mode="outlined"
          multiline
          numberOfLines={3}
          className="mb-4"
        />

        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-sm font-medium text-onSurfaceVariant">Thời gian nhắc</Text>
            {isInvalidDate && (
              <Text style={{ color: theme.colors.error }} className="text-[10px] font-bold">
                Cần ≥ 1 phút từ hiện tại
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            className={`flex-row items-center p-3 bg-muted rounded-lg border ${isInvalidDate ? 'border-error' : 'border-border'}`}
          >
            <Text 
              className="text-base"
              style={{ color: isInvalidDate ? theme.colors.error : theme.colors.onSurface }}
            >
              {dayjs(date).format('DD/MM/YYYY HH:mm')}
            </Text>
          </TouchableOpacity>
        </View>

        {(showDatePicker || showTimePicker) && (
          <DateTimePicker
            value={date}
            mode={showDatePicker ? 'date' : 'time'}
            is24Hour={true}
            display="default"
            onChange={showDatePicker ? handleDateChange : handleTimeChange}
            minimumDate={new Date()}
          />
        )}

        <View className="flex-row justify-end gap-2">
          <Button mode="text" onPress={onDismiss}>Hủy</Button>
          <Button
            mode="contained"
            onPress={handleOk}
            loading={isSubmitting}
            disabled={!content.trim() || isSubmitting || isInvalidDate}
          >
            Tạo
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}
