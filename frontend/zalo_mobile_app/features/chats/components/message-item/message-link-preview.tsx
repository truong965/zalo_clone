import React from 'react';
import { View, TouchableOpacity, Linking, StyleSheet, Image } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

interface MessageLinkPreviewProps {
  url: string;
  theme: any;
}

function normalizeUrl(rawUrl: string): string {
  const cleaned = rawUrl.trim().replace(/[),.!?]+$/, '');
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
  return `https://${cleaned}`;
}

function getHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}

function extractTitle(html: string): string | null {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  if (ogTitle) return ogTitle.replace(/\s+/g, ' ').trim();

  const twitterTitle = html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  if (twitterTitle) return twitterTitle.replace(/\s+/g, ' ').trim();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) return null;
  return titleMatch[1].replace(/\s+/g, ' ').trim();
}

function extractImage(html: string): string | null {
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  if (ogImage) return ogImage.trim();

  const twitterImage = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  if (twitterImage) return twitterImage.trim();

  return null;
}

export function MessageLinkPreview({ url, theme }: MessageLinkPreviewProps) {
  const normalizedUrl = React.useMemo(() => normalizeUrl(url), [url]);
  const hostname = React.useMemo(() => getHostname(normalizedUrl), [normalizedUrl]);
  const [title, setTitle] = React.useState<string | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const loadPreviewTitle = async () => {
      try {
        const response = await fetch(normalizedUrl, { signal: controller.signal });
        const html = await response.text();
        const pageTitle = extractTitle(html);
        const pageImage = extractImage(html);
        if (active && pageTitle) {
          setTitle(pageTitle);
        }
        if (active && pageImage) {
          try {
            const absoluteImageUrl = new URL(pageImage, normalizedUrl).toString();
            setImageUrl(absoluteImageUrl);
          } catch {
            setImageUrl(null);
          }
        }
      } catch {
        if (active) {
          setTitle(null);
          setImageUrl(null);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    };

    if (/^https?:\/\//i.test(normalizedUrl)) {
      loadPreviewTitle();
    }

    return () => {
      active = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [normalizedUrl]);

  return (
    <TouchableOpacity
      style={[styles.container, { borderColor: theme.colors.outlineVariant || '#d1d5db' }]}
      activeOpacity={0.85}
      onPress={() => Linking.openURL(normalizedUrl)}
    >
      {!!imageUrl && (
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      )}
      <View style={styles.bottomRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="link-outline" size={18} color={theme.colors.primary} />
        </View>
        <View style={styles.metaWrap}>
          <Text numberOfLines={2} style={styles.title}>
            {title || hostname}
          </Text>
          <Text numberOfLines={1} style={styles.url}>
            {hostname}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  thumbnail: {
    width: '100%',
    height: 128,
    backgroundColor: '#e5e7eb',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,145,255,0.12)',
  },
  metaWrap: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  url: {
    marginTop: 2,
    fontSize: 11,
    color: '#6b7280',
  },
});
