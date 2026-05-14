import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

type PasswordInputProps = {
      value: string;
      onChangeText: (text: string) => void;
      onBlur?: () => void;
      placeholder?: string;
      autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
      className?: string;
};

export function PasswordInput({
      value,
      onChangeText,
      onBlur,
      placeholder = 'Password',
      autoCapitalize = 'none',
      className = 'rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground',
}: PasswordInputProps) {
      const [showPassword, setShowPassword] = useState(false);

      return (
            <View className="relative">
                  <TextInput
                        value={value}
                        onChangeText={onChangeText}
                        onBlur={onBlur}
                        placeholder={placeholder}
                        secureTextEntry={!showPassword}
                        autoCapitalize={autoCapitalize}
                        className={className}
                  />
                  <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 -translate-x-0 justify-center items-center">
                        <MaterialCommunityIcons
                              name={showPassword ? 'eye-off' : 'eye'}
                              size={24}
                              color="hsl(217.2 32.6% 17.5%)"
                        />
                  </Pressable>
            </View>
      );
}
