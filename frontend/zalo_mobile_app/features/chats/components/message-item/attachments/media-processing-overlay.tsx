import React from 'react';
import { View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';

interface MediaProcessingOverlayProps {
  style?: ViewStyle;
  showText?: boolean;
}

export function MediaProcessingOverlay({ style, showText = true }: MediaProcessingOverlayProps) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, style]}>
      <ActivityIndicator color="white" size="small" />
      {showText && (
        <Text style={styles.text}>Đang xử lý...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500',
  },
});
