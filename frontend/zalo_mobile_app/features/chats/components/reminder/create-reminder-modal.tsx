import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Modal, Portal, TextInput, Button, useTheme, IconButton } from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
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
        text1: t('reminder.validation.invalidTime', 'Thời gian không hợp lệ'),
        text2: t('reminder.validation.minTime', 'Vui lòng chọn thời gian nhắc hẹn ít nhất 1 phút từ hiện tại'),
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

  const renderPickerTrigger = (
    label: string,
    value: string,
    onPress: () => void,
    icon: string
  ) => (
    <View className="flex-1">
      <Text className="text-xs font-medium text-onSurfaceVariant mb-1 px-1">{label}</Text>
      <TouchableOpacity
        onPress={onPress}
        className="flex-row items-center p-3 bg-elevation-level2 rounded-xl border border-outline-variant"
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name={icon as any} size={20} color={theme.colors.primary} className="mr-2" />
        <Text className="text-base font-medium text-onSurface">{value}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: theme.colors.elevation.level3,
          padding: 24,
          margin: 16,
          borderRadius: 24,
          elevation: 5,
        }}
      >
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-2xl font-bold text-onSurface">Tạo nhắc hẹn</Text>
          <IconButton icon="close" size={24} onPress={onDismiss} className="m-0" />
        </View>

        <TextInput
          label="Bạn muốn nhắc nhở về điều gì?"
          placeholder="Nhập nội dung nhắc hẹn..."
          value={content}
          onChangeText={setContent}
          mode="outlined"
          multiline
          numberOfLines={3}
          className="mb-6 bg-transparent"
          outlineStyle={{ borderRadius: 12 }}
        />

        <View className="mb-8">
          <View className="flex-row items-center mb-3 mt-5">
            <MaterialCommunityIcons name="clock-outline" size={16} color={isInvalidDate ? theme.colors.error : theme.colors.onSurfaceVariant} />
            <Text className={`text-sm font-medium ml-2 ${isInvalidDate ? 'text-error' : 'text-onSurfaceVariant'}`}>
              Thời gian nhắc hẹn
            </Text>
          </View>

          <View className="flex-row gap-3">
            {renderPickerTrigger(
              "Ngày nhắc",
              dayjs(date).format('DD/MM/YYYY'),
              () => setShowDatePicker(true),
              "calendar-month"
            )}
            {renderPickerTrigger(
              "Giờ nhắc",
              dayjs(date).format('HH:mm'),
              () => setShowTimePicker(true),
              "clock-time-four-outline"
            )}
          </View>

          {isInvalidDate && (
            <Text style={{ color: theme.colors.error }} className="text-[11px] font-bold mt-2 px-1">
              Phải từ {dayjs().add(1, 'minute').format('HH:mm DD/MM')} trở đi
            </Text>
          )}
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}

        {showTimePicker && (
          <DateTimePicker
            value={date}
            mode="time"
            display="spinner"
            is24Hour={true}
            onChange={handleTimeChange}
          />
        )}

        <View className="flex-row justify-end gap-3 mt-4">
          <Button
            mode="text"
            onPress={onDismiss}
            contentStyle={{ paddingHorizontal: 16 }}
          >
            Hủy
          </Button>
          <Button
            mode="contained"
            onPress={handleOk}
            loading={isSubmitting}
            disabled={!content.trim() || isSubmitting || isInvalidDate}
            contentStyle={{ paddingHorizontal: 24, paddingVertical: 4 }}
            labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
            style={{ borderRadius: 12 }}
          >
            Tạo nhắc hẹn
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}
