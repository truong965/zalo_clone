import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View, Platform, TouchableOpacity } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';

import { registerSchema, type RegisterFormData } from '@/features/auth/schemas/register-schema';
import { useColorScheme } from '@/hooks/use-color-scheme';

const INPUT_ICON = { light: '#52525b', dark: '#a1a1aa' } as const;
import { PasswordInput } from '@/features/auth/components/password-input';

type RegisterFormProps = {
      isSubmitting: boolean;
      onSubmit: (payload: RegisterFormData) => Promise<void>;
      hidePhone?: boolean;
};

export function RegisterForm({ isSubmitting, onSubmit, hidePhone = false }: RegisterFormProps) {
      const { t } = useTranslation();
      const loginHref = '/login' as Href;
      const scheme = useColorScheme() ?? 'light';
      const placeholderColor = INPUT_ICON[scheme];

      const [showDatePicker, setShowDatePicker] = useState(false);

      const {
            control,
            handleSubmit,
            formState: { errors },
      } = useForm<RegisterFormData>({
            resolver: zodResolver(registerSchema),
            defaultValues: {
                  displayName: '',
                  phoneNumber: '',
                  password: '',
                  confirmPassword: '',
                  gender: 'MALE',
                  dateOfBirth: new Date(),
            },
      });

      return (
            <View className="gap-3 rounded-2xl border border-border bg-secondary p-5">
                  <Text className="mb-1 text-2xl font-bold text-foreground">{t('auth.registerTitle')}</Text>

                  <Controller
                        control={control}
                        name="displayName"
                        render={({ field: { onChange, onBlur, value } }) => (
                              <View className="gap-1">
                                    <TextInput
                                          value={value}
                                          onBlur={onBlur}
                                          onChangeText={onChange}
                                          placeholder={t('auth.displayName')}
                                          placeholderTextColor={placeholderColor}
                                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
                                    />
                                    {errors.displayName ? (
                                          <Text className="text-sm text-destructive">{t(errors.displayName.message ?? 'auth.validation.displayNameRequired')}</Text>
                                    ) : null}
                              </View>
                        )}
                  />

                  {!hidePhone && (
                        <Controller
                              control={control}
                              name="phoneNumber"
                              render={({ field: { onChange, onBlur, value } }) => (
                                    <View className="gap-1">
                                          <TextInput
                                                value={value}
                                                onBlur={onBlur}
                                                onChangeText={onChange}
                                                placeholder={t('auth.phoneNumber')}
                                                placeholderTextColor={placeholderColor}
                                                keyboardType="phone-pad"
                                                autoCapitalize="none"
                                                className="rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
                                          />
                                          {errors.phoneNumber ? (
                                                <Text className="text-sm text-destructive">{t(errors.phoneNumber.message ?? 'auth.validation.phoneRequired')}</Text>
                                          ) : null}
                                    </View>
                              )}
                        />
                  )}

                  <Controller
                        control={control}
                        name="password"
                        render={({ field: { onChange, onBlur, value } }) => (
                              <View className="gap-1">
                                    <PasswordInput
                                          value={value}
                                          onBlur={onBlur}
                                          onChangeText={onChange}
                                          placeholder={t('auth.password')}
                                          placeholderTextColor={placeholderColor}
                                          secureTextEntry
                                          autoCapitalize="none"
                                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground pr-12"
                                    />
                                    {errors.password ? (
                                          <Text className="text-sm text-destructive">{t(errors.password.message ?? 'auth.validation.passwordRequired')}</Text>
                                    ) : null}
                              </View>
                        )}
                  />

                  <View className="gap-1.5">
                        <Text className="text-sm font-medium text-foreground">{t('auth.gender')}</Text>
                        <Controller
                              control={control}
                              name="gender"
                              render={({ field: { onChange, value } }) => (
                                    <SegmentedButtons
                                          value={value || 'MALE'}
                                          onValueChange={onChange}
                                          buttons={[
                                                { value: 'MALE', label: 'Nam' },
                                                { value: 'FEMALE', label: 'Nữ' },
                                                { value: 'OTHER', label: 'Khác' },
                                          ]}
                                          style={{ borderRadius: 12 }}
                                    />
                              )}
                        />
                  </View>

                  <View className="gap-1.5">
                        <Text className="text-sm font-medium text-foreground">{t('auth.birthday')}</Text>
                        <Controller
                              control={control}
                              name="dateOfBirth"
                              render={({ field: { value, onChange } }) => (
                                    <View>
                                          <TouchableOpacity
                                                onPress={() => setShowDatePicker(true)}
                                                className="flex-row items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5">
                                                <Text className="text-base text-foreground">
                                                      {value instanceof Date ? format(value, 'dd/MM/yyyy') : t('common.unknown')}
                                                </Text>
                                                <Ionicons name="calendar-outline" size={20} color={placeholderColor} />
                                          </TouchableOpacity>

                                          {showDatePicker && (
                                                <DateTimePicker
                                                      value={value instanceof Date ? value : new Date()}
                                                      mode="date"
                                                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                                      maximumDate={new Date()}
                                                      onChange={(_event, date) => {
                                                            setShowDatePicker(false);
                                                            if (date) {
                                                                  onChange(date);
                                                            }
                                                      }}
                                                />
                                          )}
                                          {errors.dateOfBirth ? (
                                                <Text className="text-sm text-destructive">{t(errors.dateOfBirth.message as any)}</Text>
                                          ) : null}
                                    </View>
                              )}
                        />
                  </View>

                  <Controller
                        control={control}
                        name="confirmPassword"
                        render={({ field: { onChange, onBlur, value } }) => (
                              <View className="gap-1">
                                    <PasswordInput
                                          value={value}
                                          onBlur={onBlur}
                                          onChangeText={onChange}
                                          placeholder={t('auth.confirmPassword')}
                                          placeholderTextColor={placeholderColor}
                                          secureTextEntry
                                          autoCapitalize="none"
                                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground pr-12"
                                    />
                                    {errors.confirmPassword ? (
                                          <Text className="text-sm text-destructive">{t(errors.confirmPassword.message ?? 'auth.validation.confirmPasswordRequired')}</Text>
                                    ) : null}
                              </View>
                        )}
                  />

                  <Pressable
                        className="mt-1 items-center rounded-xl bg-primary py-3"
                        onPress={() => void handleSubmit(onSubmit)()}
                        disabled={isSubmitting}>
                        <Text className="text-base font-bold text-primary-foreground">
                              {isSubmitting ? t('common.loading') : t('auth.createAccount')}
                        </Text>
                  </Pressable>

                  {!hidePhone && (
                        <Link href={loginHref} asChild>
                              <Pressable>
                                    <Text className="mt-1 text-center font-semibold text-primary">{t('auth.hasAccountLogin')}</Text>
                              </Pressable>
                        </Link>
                  )}
            </View>
      );
}
