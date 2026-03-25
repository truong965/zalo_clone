import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { getFullUrl } from '@/utils/url-helpers';

interface UserAvatarProps {
  uri?: string | null;
  size?: number;
  updatedAt?: string;
}

export const UserAvatar = React.memo(({ uri, size = 40, updatedAt }: UserAvatarProps) => {
  const theme = useTheme();
  const [hasError, setHasError] = React.useState(false);

  // Reset error state if uri changes
  React.useEffect(() => {
    setHasError(false);
  }, [uri]);

  let fullUri = getFullUrl(uri);

  const renderFallback = () => (
    <View
      style={[
        styles.avatarContainer,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.surfaceVariant,
        },
      ]}
    >
      <Ionicons name="person" size={size * 0.6} color={theme.colors.backdrop} />
    </View>
  );

  if (fullUri && typeof fullUri === 'string' && fullUri.trim() !== '' && !hasError) {
    // Force image refresh if updatedAt is provided
    const finalUri = updatedAt
      ? `${fullUri}${fullUri.includes('?') ? '&' : '?'}t=${new Date(updatedAt).getTime()}`
      : fullUri;

    return (
      <Image
        key={finalUri} // Use URI as key to force component remount for standard Image
        source={{ uri: finalUri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
        onError={() => setHasError(true)}
      />
    );
  }

  return renderFallback();
});

UserAvatar.displayName = 'UserAvatar';

const styles = StyleSheet.create({
  avatarContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});