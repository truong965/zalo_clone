import React, { useRef, useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

interface OtpInputProps {
      length?: number;
      value: string;
      onChange: (value: string) => void;
      disabled?: boolean;
}

export const OtpInput: React.FC<OtpInputProps> = ({ 
      length = 6, 
      value, 
      onChange, 
      disabled = false 
}) => {
      const inputRefs = useRef<TextInput[]>([]);
      const [otp, setOtp] = useState<string[]>(new Array(length).fill(''));

      // Sync internal state with external value (e.g. for reset)
      useEffect(() => {
            const newOtp = value.split('').slice(0, length);
            const paddedOtp = [...newOtp, ...new Array(length - newOtp.length).fill('')];
            setOtp(paddedOtp);
      }, [value, length]);

      const handleOtpChange = (text: string, index: number) => {
            const newOtp = [...otp];
            // Take only the last character if multiple are entered (e.g. paste or fast typing)
            const char = text.slice(-1);
            newOtp[index] = char;
            setOtp(newOtp);

            const combinedOtp = newOtp.join('');
            onChange(combinedOtp);

            // Move to next input if character entered
            if (char && index < length - 1) {
                  inputRefs.current[index + 1]?.focus();
            }
      };

      const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
            if (e.nativeEvent.key === 'Backspace') {
                  if (!otp[index] && index > 0) {
                        // Move to previous input on backspace if current is empty
                        inputRefs.current[index - 1]?.focus();
                  }
            }
      };

      return (
            <View className="flex-row justify-between w-full px-2">
                  {otp.map((digit, index) => (
                        <View 
                              key={index} 
                              className={`w-12 h-14 border-2 rounded-xl bg-background items-center justify-center ${
                                    digit ? 'border-primary' : 'border-border'
                              }`}
                        >
                              <TextInput
                                    ref={(ref) => {
                                          if (ref) inputRefs.current[index] = ref;
                                    }}
                                    className="text-2xl font-bold text-foreground text-center w-full h-full"
                                    value={digit}
                                    onChangeText={(text) => handleOtpChange(text, index)}
                                    onKeyPress={(e) => handleKeyPress(e, index)}
                                    keyboardType="number-pad"
                                    maxLength={index === 0 ? length : 1} // Only first box supports full length for paste
                                    editable={!disabled}
                                    selectTextOnFocus
                                    autoFocus={index === 0}
                              />
                        </View>
                  ))}
            </View>
      );
};
