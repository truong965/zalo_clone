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

type RegisterFormProps = {
      isSubmitting: boolean;
      onSubmit: (payload: RegisterFormData) => Promise<void>;
      hidePhone?: boolean;
};

export function RegisterForm({ isSubmitting, onSubmit, hidePhone = false }: RegisterFormProps) {
      const { t } = useTranslation();
      const loginHref = '/login' as Href;

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
                                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
                                    />
                                    {errors.displayName ? (
                                          <Text className="text-sm text-danger">{t(errors.displayName.message ?? 'auth.validation.displayNameRequired')}</Text>
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
                                                keyboardType="phone-pad"
                                                autoCapitalize="none"
                                                className="rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
                                          />
                                          {errors.phoneNumber ? (
                                                <Text className="text-sm text-danger">{t(errors.phoneNumber.message ?? 'auth.validation.phoneRequired')}</Text>
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
                                    <TextInput
                                          value={value}
                                          onBlur={onBlur}
                                          onChangeText={onChange}
                                          placeholder={t('auth.password')}
                                          secureTextEntry
                                          autoCapitalize="none"
                                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
                                    />
                                    {errors.password ? (
                                          <Text className="text-sm text-danger">{t(errors.password.message ?? 'auth.validation.passwordRequired')}</Text>
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
                                                <Ionicons name="calendar-outline" size={20} color="#8E8E93" />
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
                                                <Text className="text-sm text-danger">{t(errors.dateOfBirth.message as any)}</Text>
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
                                    <TextInput
                                          value={value}
                                          onBlur={onBlur}
                                          onChangeText={onChange}
                                          placeholder={t('auth.confirmPassword')}
                                          secureTextEntry
                                          autoCapitalize="none"
                                          className="rounded-xl border border-border bg-background px-3 py-2.5 text-base text-foreground"
                                    />
                                    {errors.confirmPassword ? (
                                          <Text className="text-sm text-danger">{t(errors.confirmPassword.message ?? 'auth.validation.confirmPasswordRequired')}</Text>
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
