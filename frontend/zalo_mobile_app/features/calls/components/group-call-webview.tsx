import React, { useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface GroupCallWebViewProps {
  url: string;
  onLeave?: () => void;
}

export function GroupCallWebView({ url, onLeave }: GroupCallWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        scrollEnabled={false}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        )}
        injectedJavaScript={`
          (function() {
            window.addEventListener('message', function(event) {
              if (event.data && (event.data.action === 'left-meeting' || event.data === 'left-meeting')) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'left-meeting' }));
              }
            });
            // Also monitor URL changes for hash-based navigation
            var lastUrl = window.location.href;
            setInterval(function() {
              if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'url-change', url: lastUrl }));
              }
            }, 500);
          })();
          true;
        `}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log('[GroupCallWebView] Message from WebView:', data);
            if (data.type === 'left-meeting') {
              onLeave?.();
            } else if (data.type === 'url-change') {
              if (data.url.includes('#left') || data.url.includes('/left')) {
                onLeave?.();
              }
            }
          } catch (e) {
            console.warn('[GroupCallWebView] Failed to parse WebView message:', e);
          }
        }}
        // Detect if Daily navigates away from the room (e.g. after leaving)
        onNavigationStateChange={(navState) => {
          console.log('[GroupCallWebView] Navigation state:', navState.url);
          // Detect both full navigation and hash changes that indicate leaving
          if (navState.url && (
              (!navState.url.includes('/call-') && !navState.url.includes('?t=')) ||
              navState.url.includes('#left') || 
              navState.url.includes('/left')
          )) {
             onLeave?.();
          }
        }}
        // Permission handling for camera/microphone in WebView
        // @ts-ignore
        onPermissionRequest={(event: any) => {
          event.request.grant(event.request.resources);
        }}
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
