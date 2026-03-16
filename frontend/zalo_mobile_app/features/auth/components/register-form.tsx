import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';

import { registerSchema, type RegisterFormData } from '@/features/auth/schemas/register-schema';

type RegisterFormProps = {
      isSubmitting: boolean;
      onSubmit: (payload: RegisterFormData) => Promise<void>;
};

export function RegisterForm({ isSubmitting, onSubmit }: RegisterFormProps) {
      const { t } = useTranslation();
      const loginHref = '/login' as Href;

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

                  <Link href={loginHref} asChild>
                        <Pressable>
                              <Text className="mt-1 text-center font-semibold text-primary">{t('auth.hasAccountLogin')}</Text>
                        </Pressable>
                  </Link>
            </View>
      );
}
