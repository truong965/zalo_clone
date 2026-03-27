import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Appbar, List, RadioButton, Button, Text, Divider, useTheme, Card } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { usePrivacySettings, useUpdatePrivacySettings } from '@/features/profile/api/privacy.api';
import type { PrivacyLevel, UpdatePrivacySettingsPayload } from '@/types/privacy';

type PrivacyField = 'showProfile' | 'whoCanMessageMe' | 'whoCanCallMe';

export default function PrivacyScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useTheme();
  
  const { data: serverSettings, isLoading } = usePrivacySettings();
  const { mutate: update, isPending } = useUpdatePrivacySettings();

  const [localEdits, setLocalEdits] = useState<Partial<UpdatePrivacySettingsPayload>>({});

  const form = serverSettings ? {
    showProfile: localEdits.showProfile ?? serverSettings.showProfile,
    whoCanMessageMe: localEdits.whoCanMessageMe ?? serverSettings.whoCanMessageMe,
    whoCanCallMe: localEdits.whoCanCallMe ?? serverSettings.whoCanCallMe,
  } : null;

  const isDirty = Object.keys(localEdits).length > 0;

  const handleFieldChange = (field: PrivacyField, value: PrivacyLevel) => {
    setLocalEdits(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!form) return;

    Alert.alert(
      t('settings.privacy.confirmTitle'),
      t('settings.privacy.confirmContent'),
      [
        { text: t('settings.privacy.cancel'), style: 'cancel' },
        { 
          text: t('settings.privacy.saveChanges'), 
          onPress: () => {
            update(localEdits, {
              onSuccess: () => {
                setLocalEdits({});
                Alert.alert(t('common.success'), t('settings.privacy.updateSuccess'));
              },
              onError: () => {
                Alert.alert(t('common.error'), t('settings.privacy.updateError'));
              }
            });
          }
        }
      ]
    );
  };

  if (isLoading || !form) {
    return (
      <View className="flex-1 bg-background">
        <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
          <Appbar.BackAction color="white" onPress={() => router.back()} />
          <Appbar.Content title={t('settings.privacy.title')} titleStyle={{ color: 'white' }} />
        </Appbar.Header>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#1E88E5" />
        </View>
      </View>
    );
  }

  const renderSettingItem = (field: PrivacyField, title: string, description: string) => (
    <List.Section>
      <List.Subheader className="font-bold text-primary">{title}</List.Subheader>
      <Text className="px-4 text-xs text-muted-foreground mb-2">{description}</Text>
      <RadioButton.Group 
        onValueChange={value => handleFieldChange(field, value as PrivacyLevel)} 
        value={form[field]}
      >
        <List.Item
          title={t('settings.privacy.everyone')}
          left={() => <RadioButton value="EVERYONE" />}
          onPress={() => handleFieldChange(field, 'EVERYONE')}
        />
        <Divider />
        <List.Item
          title={t('settings.privacy.contacts')}
          left={() => <RadioButton value="CONTACTS" />}
          onPress={() => handleFieldChange(field, 'CONTACTS')}
        />
      </RadioButton.Group>
    </List.Section>
  );

  return (
    <View className="flex-1 bg-[#f4f5f7]">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title={t('settings.privacy.title')} titleStyle={{ color: 'white' }} />
        {isDirty && (
          <Appbar.Action 
            icon="check" 
            color="white" 
            onPress={handleSave} 
            disabled={isPending}
          />
        )}
      </Appbar.Header>

      <ScrollView className="flex-1">
        <View className="p-4">
          <Card className="bg-background overflow-hidden">
            {renderSettingItem(
              'showProfile', 
              t('settings.privacy.showProfile'), 
              t('settings.privacy.showProfileDesc')
            )}
            <Divider />
            {renderSettingItem(
              'whoCanMessageMe', 
              t('settings.privacy.whoCanMessageMe'), 
              t('settings.privacy.whoCanMessageMeDesc')
            )}
            <Divider />
            {renderSettingItem(
              'whoCanCallMe', 
              t('settings.privacy.whoCanCallMe'), 
              t('settings.privacy.whoCanCallMeDesc')
            )}
          </Card>

          {isDirty && (
            <View className="mt-6">
              <Button 
                mode="contained" 
                onPress={handleSave} 
                loading={isPending}
                disabled={isPending}
                style={{ borderRadius: 8 }}
                contentStyle={{ height: 48 }}
              >
                {t('settings.privacy.saveChanges')}
              </Button>
              <Text className="text-center mt-2 text-xs text-amber-600">
                ⚠️ {t('settings.privacy.unsavedChanges')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
