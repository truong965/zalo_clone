import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

interface SettingsListItemProps {
  icon: string;
  label: string;
  onPress: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}

export function SettingsListItem({ icon, label, onPress, right, destructive }: SettingsListItemProps) {
  const theme = useTheme();

  return (
    <TouchableOpacity
      className="flex-row items-center p-4 bg-card border-b border-border"
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View className="w-10 items-center">
        <Ionicons 
            name={icon as any} 
            size={24} 
            color={destructive ? theme.colors.error : theme.colors.onSurfaceVariant} 
        />
      </View>
      
      <Text 
        className={`flex-1 ml-2 text-base ${destructive ? 'text-error font-medium' : 'text-foreground'}`}
      >
        {label}
      </Text>

      {right ? (
          right
      ) : (
          <Ionicons name="chevron-forward" size={20} color={theme.colors.outline} />
      )}
    </TouchableOpacity>
  );
}
