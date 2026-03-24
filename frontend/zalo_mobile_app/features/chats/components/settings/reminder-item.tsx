import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text, useTheme, IconButton, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { ReminderItem as ReminderType } from '@/types/reminder';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface ReminderItemProps {
  reminder: ReminderType;
  currentUserId: string;
  onDelete: (id: string) => void;
  onComplete: (id: string) => void;
}

export function ReminderItem({ reminder, currentUserId, onDelete, onComplete }: ReminderItemProps) {
  const theme = useTheme();
  const isCreator = reminder.userId === currentUserId;
  const isPassed = new Date() > new Date(reminder.remindAt);
  const showComplete = isCreator && isPassed && !reminder.isCompleted;

  return (
    <View className="flex-row items-center p-3 border-b border-border bg-card">
      <View className="bg-primary/10 p-2 rounded-full mr-3">
        <Ionicons 
          name={reminder.isCompleted ? "checkmark-circle" : "time"} 
          size={20} 
          color={reminder.isCompleted ? theme.colors.primary : theme.colors.secondary} 
        />
      </View>
      
      <View className="flex-1">
        <Text className={`font-medium ${reminder.isCompleted ? 'text-muted-foreground line-through' : ''}`}>
          {reminder.content}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {format(new Date(reminder.remindAt), 'HH:mm, dd/MM/yyyy', { locale: vi })}
        </Text>
      </View>

      <View className="flex-row items-center">
        {showComplete && (
          <Button 
            mode="text" 
            compact 
            onPress={() => onComplete(reminder.id)}
            labelStyle={{ fontSize: 12 }}
          >
            Đã xem
          </Button>
        )}
        {isCreator && (
          <IconButton
            icon="trash-can-outline"
            size={20}
            onPress={() => onDelete(reminder.id)}
            iconColor={theme.colors.error}
          />
        )}
      </View>
    </View>
  );
}
