import React from 'react';
import { View, StyleSheet } from 'react-native';
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
    label = `Hôm nay ${format(d, 'HH:mm')}`;
  } else if (isYesterday(d)) {
    label = `Hôm qua ${format(d, 'HH:mm')}`;
  } else {
    label = format(d, 'HH:mm dd/MM/yyyy', { locale: vi });
  }

  return (
    <View style={styles.container}>
      <View style={styles.pill}>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 24,
  },
  pill: {
    backgroundColor: 'rgba(209,213,219,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  label: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '500',
  },
});
