import { Image } from 'expo-image';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Collapsible } from '@/components/ui/collapsible';
import { ExternalLink } from '@/components/external-link';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Fonts } from '@/constants/theme';

export function ExploreScreen() {
      const { t } = useTranslation();

      return (
            <ParallaxScrollView
                  headerBackgroundColor={{ light: '#D0D0D0', dark: '#353636' }}
                  headerImage={
                        <IconSymbol
                              size={310}
                              color="#808080"
                              name="chevron.left.forwardslash.chevron.right"
                              style={{ color: '#808080', bottom: -90, left: -35, position: 'absolute' }}
                        />
                  }>
                  <ThemedView style={{ flexDirection: 'row', gap: 8 }}>
                        <ThemedText
                              type="title"
                              style={{
                                    fontFamily: Fonts.rounded,
                              }}>
                              {t('explore.title')}
                        </ThemedText>
                  </ThemedView>
                  <ThemedText>{t('explore.intro')}</ThemedText>
                  <Collapsible title={t('explore.sections.fileRouting.title')}>
                        <ThemedText>
                              {t('explore.sections.fileRouting.descriptionPrefix')}{' '}
                              <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> {t('explore.sections.fileRouting.and')}{' '}
                              <ThemedText type="defaultSemiBold">app/(tabs)/explore.tsx</ThemedText>
                        </ThemedText>
                        <ThemedText>
                              {t('explore.sections.fileRouting.layoutPrefix')}{' '}
                              <ThemedText type="defaultSemiBold">app/(tabs)/_layout.tsx</ThemedText> {t('explore.sections.fileRouting.layoutSuffix')}
                        </ThemedText>
                        <ExternalLink href="https://docs.expo.dev/router/introduction">
                              <ThemedText type="link">{t('explore.learnMore')}</ThemedText>
                        </ExternalLink>
                  </Collapsible>
                  <Collapsible title={t('explore.sections.crossPlatform.title')}>
                        <ThemedText>
                              {t('explore.sections.crossPlatform.descriptionPrefix')}{' '}
                              <ThemedText type="defaultSemiBold">w</ThemedText> {t('explore.sections.crossPlatform.descriptionSuffix')}
                        </ThemedText>
                  </Collapsible>
                  <Collapsible title={t('explore.sections.images.title')}>
                        <ThemedText>
                              {t('explore.sections.images.descriptionPrefix')}{' '}
                              <ThemedText type="defaultSemiBold">@2x</ThemedText> {t('explore.sections.images.and')}{' '}
                              <ThemedText type="defaultSemiBold">@3x</ThemedText> {t('explore.sections.images.descriptionSuffix')}
                        </ThemedText>
                        <Image source={require('@/assets/images/react-logo.png')} style={{ width: 100, height: 100, alignSelf: 'center' }} />
                        <ExternalLink href="https://reactnative.dev/docs/images">
                              <ThemedText type="link">{t('explore.learnMore')}</ThemedText>
                        </ExternalLink>
                  </Collapsible>
                  <Collapsible title={t('explore.sections.theme.title')}>
                        <ThemedText>
                              {t('explore.sections.theme.descriptionPrefix')}{' '}
                              <ThemedText type="defaultSemiBold">useColorScheme()</ThemedText>{' '}
                              {t('explore.sections.theme.descriptionSuffix')}
                        </ThemedText>
                        <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/">
                              <ThemedText type="link">{t('explore.learnMore')}</ThemedText>
                        </ExternalLink>
                  </Collapsible>
                  <Collapsible title={t('explore.sections.animation.title')}>
                        <ThemedText>
                              {t('explore.sections.animation.descriptionPrefix')}{' '}
                              <ThemedText type="defaultSemiBold">components/HelloWave.tsx</ThemedText>{' '}
                              {t('explore.sections.animation.descriptionMiddle')}{' '}
                              <ThemedText type="defaultSemiBold" style={{ fontFamily: Fonts.mono }}>
                                    react-native-reanimated
                              </ThemedText>{' '}
                              {t('explore.sections.animation.descriptionSuffix')}
                        </ThemedText>
                        {Platform.select({
                              ios: (
                                    <ThemedText>
                                          {t('explore.sections.animation.iosPrefix')}{' '}
                                          <ThemedText type="defaultSemiBold">components/ParallaxScrollView.tsx</ThemedText>{' '}
                                          {t('explore.sections.animation.iosSuffix')}
                                    </ThemedText>
                              ),
                        })}
                  </Collapsible>
            </ParallaxScrollView>
      );
}
