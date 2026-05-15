import { useState } from 'react';
import {
      Pressable,
      TextInput,
      View,
      TextInputProps,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface PasswordInputProps extends TextInputProps {
      className?: string;
}

export function PasswordInput({
      value,
      onChangeText,
      onBlur,
      placeholder = 'Password',
      autoCapitalize = 'none',
      className = 'rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground',
      secureTextEntry,
      ...rest
}: PasswordInputProps) {
      const [showPassword, setShowPassword] = useState(false);

      return (
            <View className="relative">
                  <TextInput
                        value={value}
                        onChangeText={onChangeText}
                        onBlur={onBlur}
                        placeholder={placeholder}
                        secureTextEntry={secureTextEntry ?? !showPassword}
                        autoCapitalize={autoCapitalize}
                        className={className}
                        {...rest}
                  />

                  <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 items-center justify-center">
                        <MaterialCommunityIcons
                              name={showPassword ? 'eye-off' : 'eye'}
                              size={24}
                              color="hsl(217.2 32.6% 17.5%)"
                        />
                  </Pressable>
            </View>
      );
}