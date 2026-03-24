import React, { forwardRef } from 'react';
import { View, TextInput as RNTextInput, KeyboardTypeOptions } from 'react-native';
import { IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

export interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  containerClass?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

export const SearchBar = forwardRef<RNTextInput, SearchBarProps>((props, ref) => {
  const {
    value,
    onChangeText,
    placeholder = "Tìm kiếm...",
    keyboardType = "default",
    autoFocus = false,
    onFocus,
    onBlur,
    containerClass = "p-3",
    autoCapitalize = "none",
  } = props;

  return (
    <View className={containerClass}>
      <View className="flex-row items-center bg-gray-100 rounded-lg px-3 h-[50px]">
        <Ionicons name="search" size={20} color="#666" />
        <RNTextInput
          ref={ref}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          autoFocus={autoFocus}
          className="flex-1 ml-2 text-base text-black"
          style={{ height: '100%', textAlignVertical: 'center' }}
          placeholderTextColor="#999"
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          spellCheck={false}
          enablesReturnKeyAutomatically
          clearButtonMode="never"
        />
        <View className="w-8 items-center justify-center">
          {value.length > 0 && (
            <IconButton 
              icon="close-circle" 
              size={20} 
              iconColor="#ccc" 
              onPress={() => onChangeText('')} 
              style={{ margin: 0 }}
            />
          )}
        </View>
      </View>
    </View>
  );
});

SearchBar.displayName = 'SearchBar';
