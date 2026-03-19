/**
 * NotificationSoundSection — Settings UI for notification sounds.
 *
 * Reads/writes directly from/to localStorage (Option A: frontend-only).
 * Uses the same SectionCard + SettingRow patterns as the parent settings page.
 */

import { useState, useCallback } from 'react';
import { Typography, Switch, Segmented } from 'antd';
import { useTranslation } from 'react-i18next';
import {
      readNotificationSoundSettings,
      writeNotificationSoundSetting,
      type NotificationSoundSettings,
      type NotificationSoundVolume,
} from '../services/notification-sound-settings';

const { Title, Paragraph, Text } = Typography;

// ── Shared primitives (mirrored from settings.tsx to avoid circular dep) ──

function SectionCard({ children }: { children: React.ReactNode }) {
      return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {children}
            </div>
      );
}

function SettingRow({
      label,
      description,
      control,
      last = false,
      disabled = false,
}: {
      label: string;
      description?: string;
      control: React.ReactNode;
      last?: boolean;
      disabled?: boolean;
}) {
      return (
            <div
                  className={`flex items-center justify-between gap-4 px-6 py-4${!last ? ' border-b border-gray-50' : ''
                        }${disabled ? ' opacity-50' : ''}`}
            >
                  <div className="min-w-0">
                        <Text className="text-sm font-medium text-gray-800 block">
                              {label}
                        </Text>
                        {description && (
                              <Text className="text-xs text-gray-400 mt-0.5 block">
                                    {description}
                              </Text>
                        )}
                  </div>
                  <div className="flex-shrink-0">{control}</div>
            </div>
      );
}

// ── Toggle row config ─────────────────────────────────────────────────

type BoolField = 'incomingCall' | 'messageDirect' | 'messageGroup' | 'social';

// ── Component ─────────────────────────────────────────────────────────

export function NotificationSoundSection() {
      const { t } = useTranslation();
      // Local state initialised from localStorage
      const [settings, setSettings] = useState<NotificationSoundSettings>(readNotificationSoundSettings);

      const updateField = useCallback(<K extends keyof NotificationSoundSettings>(
            field: K,
            value: NotificationSoundSettings[K],
      ) => {
            writeNotificationSoundSetting(field, value);
            setSettings((prev) => ({ ...prev, [field]: value }));
      }, []);

      const masterDisabled = !settings.master;

      const SOUND_TOGGLES: { field: BoolField; label: string; description: string }[] = [
            {
                  field: 'incomingCall',
                  label: t('notification.incomingCallLabel'),
                  description: t('notification.incomingCallDesc'),
            },
            {
                  field: 'messageDirect',
                  label: t('notification.directMsgLabel'),
                  description: t('notification.directMsgDesc'),
            },
            {
                  field: 'messageGroup',
                  label: t('notification.groupMsgLabel'),
                  description: t('notification.groupMsgDesc'),
            },
            {
                  field: 'social',
                  label: t('notification.socialLabel'),
                  description: t('notification.socialDesc'),
            },
      ];

      const VOLUME_OPTIONS = [
            { label: t('notification.volumeLow'), value: 'low' as const },
            { label: t('notification.volumeMedium'), value: 'medium' as const },
            { label: t('notification.volumeHigh'), value: 'high' as const },
      ];

      return (
            <div className="space-y-6">
                  <div>
                        <Title level={4} className="!text-gray-900 dark:!text-white !mb-1">
                              {t('notification.title')}
                        </Title>
                        <Paragraph className="!text-gray-500 dark:!text-gray-400 !text-sm !mb-0">
                              {t('notification.subtitle')}
                        </Paragraph>
                  </div>

                  {/* Master toggle */}
                  <SectionCard>
                        <SettingRow
                              label={t('notification.masterLabel')}
                              description={t('notification.masterDesc')}
                              last
                              control={
                                    <Switch
                                          checked={settings.master}
                                          onChange={(v) => updateField('master', v)}
                                    />
                              }
                        />
                  </SectionCard>

                  {/* Per-type toggles */}
                  <SectionCard>
                        {SOUND_TOGGLES.map((row, idx) => (
                              <SettingRow
                                    key={row.field}
                                    label={row.label}
                                    description={row.description}
                                    last={idx === SOUND_TOGGLES.length - 1}
                                    disabled={masterDisabled}
                                    control={
                                          <Switch
                                                checked={settings[row.field]}
                                                disabled={masterDisabled}
                                                onChange={(v) => updateField(row.field, v)}
                                          />
                                    }
                              />
                        ))}
                  </SectionCard>

                  {/* Volume preset */}
                  <SectionCard>
                        <SettingRow
                              label={t('notification.volumeLabel')}
                              description={t('notification.volumeDesc')}
                              last
                              disabled={masterDisabled}
                              control={
                                    <Segmented
                                          value={settings.volume}
                                          disabled={masterDisabled}
                                          onChange={(v) => updateField('volume', v as NotificationSoundVolume)}
                                          options={VOLUME_OPTIONS}
                                    />
                              }
                        />
                  </SectionCard>

                  {/* Info tip */}
                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-5 py-4">
                        <Text className="text-xs text-blue-600">
                              {t('notification.storageNote')}
                        </Text>
                  </div>
            </div>
      );
}
