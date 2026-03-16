import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export function ModalScreen() {
      const { t } = useTranslation();

      return (
            <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                  <ThemedText type="title">{t('modal.title')}</ThemedText>
                  <Link href="/" dismissTo style={{ marginTop: 15, paddingVertical: 15 }}>
                        <ThemedText type="link">{t('modal.backHome')}</ThemedText>
                  </Link>
            </ThemedView>
      );
}
