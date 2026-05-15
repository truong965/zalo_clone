import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { PasswordInput } from '@/features/auth/components/password-input';
import { loginSchema, type LoginFormData } from '@/features/auth/schemas/login-schema';
import { useColorScheme } from '@/hooks/use-color-scheme';

type LoginFormProps = {
      isSubmitting: boolean;
      onSubmit: (payload: LoginFormData) => Promise<void>;
};

const ICON = { light: '#52525b', dark: '#a1a1aa' } as const;

export function LoginForm({ isSubmitting, onSubmit }: LoginFormProps) {
      const { t } = useTranslation();
      const scheme = useColorScheme() ?? 'light';
      const iconMuted = ICON[scheme];

      const registerHref = '/register' as Href;
      const forgotPasswordHref = '/forgot-password' as Href;

      const {
            control,
            handleSubmit,
            formState: { errors },
      } = useForm<LoginFormData>({
            resolver: zodResolver(loginSchema),
            defaultValues: {
                  phoneNumber: '',
                  password: '',
            },
      });

      return (
            <View className="rounded-3xl border border-border bg-card p-6 shadow-sm">
                  <Controller
                        control={control}
                        name="phoneNumber"
                        render={({ field: { onChange, onBlur, value } }) => (
                              <View className="mb-4">
                                    <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                          {t('auth.phoneNumber')}
                                    </Text>

                                    <View className="flex-row items-center rounded-2xl border border-border bg-background px-3.5">
                                          <Ionicons
                                                name="call-outline"
                                                size={20}
                                                color={iconMuted}
                                                style={{ marginRight: 8 }}
                                          />

                                          <TextInput
                                                value={value}
                                                onBlur={onBlur}
                                                onChangeText={onChange}
                                                placeholder={t('auth.phoneNumber')}
                                                placeholderTextColor={iconMuted}
                                                keyboardType="phone-pad"
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                textContentType="telephoneNumber"
                                                className="min-h-[52px] flex-1 py-3 text-[16px] text-foreground"
                                          />
                                    </View>

                                    {errors.phoneNumber ? (
                                          <Text className="mt-1.5 text-sm text-destructive">
                                                {t(errors.phoneNumber.message ?? 'auth.validation.phoneRequired')}
                                          </Text>
                                    ) : null}
                              </View>
                        )}
                  />

                  <Controller
                        control={control}
                        name="password"
                        render={({ field: { onChange, onBlur, value } }) => (
                              <View className="mb-5">
                                    <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                          {t('auth.password')}
                                    </Text>

                                    <PasswordInput
                                          value={value}
                                          onBlur={onBlur}
                                          onChangeText={onChange}
                                          placeholder={t('auth.password')}
                                          autoCapitalize="none"
                                    />

                                    {errors.password ? (
                                          <Text className="mt-1.5 text-sm text-destructive">
                                                {t(errors.password.message ?? 'auth.validation.passwordRequired')}
                                          </Text>
                                    ) : null}
                              </View>
                        )}
                  />

                  <Pressable
                        onPress={() => void handleSubmit(onSubmit)()}
                        disabled={isSubmitting}
                        className="mb-5 min-h-[52px] items-center justify-center rounded-2xl bg-primary active:opacity-90 disabled:opacity-50">
                        {isSubmitting ? (
                              <ActivityIndicator color="#ffffff" />
                        ) : (
                              <Text className="text-[16px] font-bold text-primary-foreground">
                                    {t('auth.login')}
                              </Text>
                        )}
                  </Pressable>

                  <View className="items-center gap-3">
                        <Link href={forgotPasswordHref} asChild>
                              <Pressable hitSlop={8}>
                                    <Text className="text-[15px] text-muted-foreground">
                                          {t('auth.forgotPassword')}
                                    </Text>
                              </Pressable>
                        </Link>

                        <Link href={registerHref} asChild>
                              <Pressable hitSlop={8}>
                                    <Text className="text-center text-[15px] font-semibold leading-5 text-primary">
                                          {t('auth.registerNow')}
                                    </Text>
                              </Pressable>
                        </Link>
                  </View>
            </View>
      );
}