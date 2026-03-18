import React from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { format, isToday, isYesterday } from 'date-fns';
import { vi } from 'date-fns/locale';

interface MessageSeparatorProps {
  date: string;
}

export function MessageSeparator({ date }: MessageSeparatorProps) {
  const d = new Date(date);
  let label = '';

  if (isToday(d)) {
    label = format(d, 'HH:mm');
  } else if (isYesterday(d)) {
    label = `Hôm qua ${format(d, 'HH:mm')}`;
  } else {
    label = `${format(d, 'HH:mm dd/MM/yyyy', { locale: vi })}`;
  }

  return (
    <View className="items-center my-4">
      <View className="bg-muted px-3 py-1 rounded-full">
        <Text className="text-muted-foreground text-[10px] font-medium uppercase">
          {label}
        </Text>
      </View>
    </View>
  );
}
