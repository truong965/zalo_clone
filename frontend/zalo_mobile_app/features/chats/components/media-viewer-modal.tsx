import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar,
  FlatList,
  useWindowDimensions,
  Image as RNImage,
} from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import Toast from 'react-native-toast-message';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS
} from 'react-native-reanimated';
// Removed expo-image to match project pattern
import { AudioWaveform } from './message-item/attachments/audio-waveform';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMediaResource } from '../hooks/use-media-resource';
import { getFullUrl } from '@/utils/url-helpers';
import { formatAudioDuration } from './message-item/message-item.utils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAX_SAF_FILE_SIZE = 10 * 1024 * 1024; // 10MB - Base64 reading over this causes OOM on Android


// ─── Image Component with Zoom ──────────────────────────────────────────────

function ZoomableImage({ item }: { item: any }) {
  // In viewer, we prefer high-quality source
  const { src, isProcessing, isError, setResourceError } = useMediaResource(item, { useFullRes: true });

  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = baseScale.value * event.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        baseScale.value = 1;
      } else if (scale.value > 5) {
        scale.value = withTiming(5);
        baseScale.value = 5;
      } else {
        baseScale.value = scale.value;
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        baseScale.value = 1;
      } else {
        scale.value = withTiming(2.5);
        baseScale.value = 2.5;
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (isError) {
    return (
      <View style={styles.mediaContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={{ color: 'white', marginTop: 10 }}>File không tồn tại</Text>
      </View>
    );
  }

  return (
    <GestureDetector gesture={Gesture.Exclusive(pinchGesture, doubleTapGesture)}>
      <View style={styles.mediaContainer}>
        <Animated.View style={[styles.imageWrapper, animatedStyle]}>
          <RNImage
            source={{ uri: src }}
            style={styles.fullMedia}
            resizeMode="contain"
            onError={() => setResourceError(true)}
          />
        </Animated.View>
        {(isProcessing || !src) && <ActivityIndicator color="white" style={styles.loader} />}
      </View>
    </GestureDetector>
  );
}

// ─── Video Component ─────────────────────────────────────────────────────────

function VideoMedia({ item, isActive }: { item: any; isActive: boolean }) {
  // Video must use cdnUrl/optimizedUrl, never thumbnail
  const { src, isProcessing, isError } = useMediaResource(item, { useFullRes: true });

  if (isError) {
    return (
      <View style={styles.mediaContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={{ color: 'white', marginTop: 10 }}>File video không tồn tại</Text>
      </View>
    );
  }

  // Fallback thumbnail if not active or still loading
  const thumbSrc = getFullUrl(item.optimizedUrl || item.thumbnailUrl || item.cdnUrl);

  // We only initialize the player for the active item to save memory (OOM prevention)
  // and we use a stable key for the player component to prevent "released object" errors.
  return (
    <View style={styles.mediaContainer}>
      {isActive && src ? (
        <ActiveVideoPlayer 
          key={`active-player-${item.id}`} // Unique key per item ensure clean mount
          src={src} 
          isProcessing={isProcessing} 
        />
      ) : (
        <View style={styles.mediaContainer}>
           {thumbSrc ? (
             <RNImage 
               source={{ uri: thumbSrc }} 
               style={styles.fullMedia} 
               resizeMode="contain" 
             />
           ) : (
             <ActivityIndicator color="white" size="large" />
           )}
           <View style={{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 30 }}>
              <Ionicons name="play" size={40} color="white" />
           </View>
           {!isActive && (
             <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 80, fontSize: 12 }}>
                Cuộn để xem video
             </Text>
           )}
        </View>
      )}
      {(isProcessing || !src) && <ActivityIndicator color="white" style={styles.loader} />}
    </View>
  );
}

/**
 * Separate component to encapsulate VideoPlayer lifecycle.
 * This ensures native objects are ONLY created for the currently viewed video.
 */
function ActiveVideoPlayer({ src, isProcessing }: { src: string; isProcessing: boolean }) {
  // Initialize with the real source immediately since it's active
  const player = useVideoPlayer(src, (p) => {
    p.loop = true;
    p.play();
  });

  // Track the source currently loaded in the player to avoid redundant synchronous/async loads
  const lastSrcRef = useRef(src);

  // Handle source changes asynchronously (especially for iOS)
  useEffect(() => {
    if (src && player && src !== lastSrcRef.current) {
      // Use replaceAsync to avoid UI freezes on iOS as recommended by Expo
      if (typeof (player as any).replaceAsync === 'function') {
        (player as any).replaceAsync(src).catch((err: any) => 
          console.error('[ActiveVideoPlayer] replaceAsync failed:', err)
        );
      } else {
        player.replace(src);
      }
      lastSrcRef.current = src;
    }
  }, [src, player]);

  return (
    <View style={styles.fullMedia}>
      <VideoView
        key="active-video-view"
        player={player}
        style={styles.fullMedia}
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        nativeControls={true}
      />
      {isProcessing && <ActivityIndicator color="white" style={styles.loader} />}
    </View>
  );
}

// ─── Voice Component ─────────────────────────────────────────────────────────

function VoiceMedia({ item, theme, isActive }: { item: any; theme: any; isActive: boolean }) {
  const { src, isProcessing, isError } = useMediaResource(item, { useFullRes: true });
  const player = useAudioPlayer(src || '');
  const status = useAudioPlayerStatus(player);
  const isPlaying = status.playing;

  // Pause when not active
  useEffect(() => {
    if (!isActive && player) {
      player.pause();
    }
  }, [isActive, player]);

  const handlePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  if (isError) {
    return (
      <View style={styles.mediaContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={{ color: 'white', marginTop: 10 }}>File âm thanh không tồn tại</Text>
      </View>
    );
  }

  return (
    <View style={styles.mediaContainer}>
      <View style={styles.voiceWrapper}>
        <TouchableOpacity
          style={[styles.playBtn, { backgroundColor: '#0091ff' }]}
          onPress={handlePlayPause}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={48} color="white" />
        </TouchableOpacity>

        <View style={styles.waveformContainer}>
          <AudioWaveform isPlaying={isPlaying} isMe={false} theme={theme} barHeightMultiplier={8} />
        </View>

        <Text style={styles.durationText}>
          {formatAudioDuration(item.duration || status.duration || 0)}
        </Text>
      </View>
      {(isProcessing || !src) && <ActivityIndicator color="white" style={styles.loader} />}
    </View>
  );
}

// ─── Main Viewer Component ───────────────────────────────────────────────────

interface MediaViewerModalProps {
  isVisible: boolean;
  onClose: () => void;
  items: any[];
  initialIndex: number;
}

export function MediaViewerModal({ isVisible, onClose, items, initialIndex }: MediaViewerModalProps) {
  const theme = useTheme();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isDownloading, setIsDownloading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isVisible) {
      setCurrentIndex(initialIndex);
      // Wait for the modal to mount and FlatList to be ready
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 200); // Increased delay to ensure FlatList is ready
      return () => clearTimeout(timer);
    }
  }, [isVisible, initialIndex]);

  const handleShare = async () => {
    const item = items[currentIndex];
    const rawSrc = item.optimizedUrl || item.cdnUrl || item.thumbnailUrl;
    const src = getFullUrl(rawSrc);

    if (!src) return;

    try {
      if (Platform.OS === 'web') {
        window.open(src, '_blank');
        return;
      }

      const fileUri = `${FileSystem.documentDirectory}${item.originalName || 'file'}`;
      const downloadRes = await FileSystem.downloadAsync(src, fileUri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadRes.uri);
      }
    } catch (error) {
      console.error('Share error:', error);
      Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Không thể chia sẻ tệp', position: 'bottom' });
    }
  };

  const handleDownload = async () => {
    if (isDownloading) return;

    const item = items[currentIndex];
    const rawSrc = item.optimizedUrl || item.cdnUrl || item.thumbnailUrl;
    const src = getFullUrl(rawSrc);

    if (!src) {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Không có liên kết tải về', position: 'bottom' });
      return;
    }

    setIsDownloading(true);
    // Attachments use mediaType, Search results use messageType
    const mediaType = item.mediaType || item.messageType;

    // Use a unique temp path to avoid IO locks and corruption
    const timestamp = Date.now();
    const originalExt = (item.originalName || '').split('.').pop()?.toLowerCase() || '';
    
    // Correct extension based on simplified mapping if possible, else fallback to original
    let ext = originalExt;
    if (mediaType === 'IMAGE' && !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) ext = 'jpg';
    if (mediaType === 'VIDEO' && !['mp4', 'mov', 'webm'].includes(ext)) ext = 'mp4';
    
    const tempFileName = `dl_${item.id || 'file'}_${timestamp}.${ext}`;
    const localUri = `${FileSystem.documentDirectory}${tempFileName}`;

    try {
      const fileName = item.originalName || `file_${timestamp}.${ext}`;
      const safeFileName = fileName.replace(/[/\\?%*:|"<>]/g, '-');

      Toast.show({ type: 'info', text1: 'Bắt đầu tải...', text2: safeFileName, position: 'bottom' });

      const downloadRes = await FileSystem.downloadAsync(src, localUri);
      if (!isMounted.current) return;

      if (downloadRes.status !== 200) throw new Error(`Download failed with status ${downloadRes.status}`);

      if (mediaType === 'IMAGE' || mediaType === 'VIDEO') {
        const { status } = await MediaLibrary.requestPermissionsAsync(true, ['photo', 'video']);
        if (status === 'granted') {
          await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
          Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã lưu vào thư viện', position: 'bottom' });
        } else {
          Toast.show({ type: 'error', text1: 'Thất bại', text2: 'Cần quyền truy cập thư viện', position: 'bottom' });
        }
      } else {
        // Document/Voice handling
        if (Platform.OS === 'android') {
          // MEMORY SAFETY: Only use SAF for small-ish files (< 10MB) to avoid OOM via Base64
          const info = await FileSystem.getInfoAsync(localUri);

          if (info.exists && info.size && info.size < MAX_SAF_FILE_SIZE) {
            const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
            if (permissions.granted) {
              const newFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
                permissions.directoryUri,
                safeFileName,
                'application/octet-stream',
              );
              const fileData = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
              await FileSystem.writeAsStringAsync(newFileUri, fileData, { encoding: FileSystem.EncodingType.Base64 });
              Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã lưu file vào máy', position: 'bottom' });
            }
          } else {
            // Memory safe fallback for > 10MB files on Android
            await Sharing.shareAsync(localUri, { UTI: 'public.item' });
            Toast.show({ type: 'success', text1: 'Thành công', text2: 'Tải xuống hoàn tất', position: 'bottom' });
          }
        } else {
          const isAvailable = await Sharing.isAvailableAsync();
          if (isAvailable) {
            await Sharing.shareAsync(localUri, { UTI: 'public.item' });
            Toast.show({ type: 'success', text1: 'Thành công', text2: 'Tải xuống hoàn tất', position: 'bottom' });
          }
        }
      }
    } catch (error) {
      console.error('[MediaViewer] Download error:', error);
      if (isMounted.current) {
        Toast.show({ 
          type: 'error', 
          text1: 'Lỗi tải xuống', 
          text2: error instanceof Error ? error.message : 'Vui lòng thử lại sau', 
          position: 'bottom' 
        });
      }
    } finally {
      if (isMounted.current) {
        setIsDownloading(false);
      }
      // Dọn dẹp file tạm ngay lập tức để giải phóng bộ nhớ
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch (err) {
        console.warn('Failed to cleanup temp file:', err);
      }
    }
  };

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    // CRITICAL: Attachments use mediaType, but Search results use messageType
    const mediaType = item.mediaType || item.messageType;
    const isActive = index === currentIndex;

    if (mediaType === 'VIDEO') {
      return <VideoMedia item={item} isActive={isActive} />;
    } else if (mediaType === 'AUDIO' || mediaType === 'VOICE') {
      return <VoiceMedia item={item} theme={theme} isActive={isActive} />;
    } else {
      return <ZoomableImage item={item} />;
    }
  }, [theme, currentIndex]);

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="black" />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <IconButton
              icon="close"
              iconColor="white"
              size={28}
              onPress={onClose}
              style={styles.headerBtn}
            />
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {items[currentIndex]?.originalName || 'Xem phương tiện'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {currentIndex + 1} / {items.length}
              </Text>
            </View>
            <IconButton
              icon="share-variant"
              iconColor="white"
              size={24}
              onPress={handleShare}
              style={styles.headerBtn}
            />
            {isDownloading ? (
               <ActivityIndicator color="white" size="small" style={{ marginHorizontal: 15 }} />
            ) : (
              <IconButton
                icon="download"
                iconColor="white"
                size={24}
                onPress={handleDownload}
                style={styles.headerBtn}
              />
            )}
          </View>

          {/* Media List */}
          <FlatList
            ref={flatListRef}
            data={items}
            renderItem={renderItem}
            keyExtractor={(item, index) => `${item.id || item.mediaId || index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollToIndexFailed={(info) => {
              // Fallback if scroll fails
              flatListRef.current?.scrollToOffset({ offset: info.index * SCREEN_WIDTH, animated: false });
            }}
            onMomentumScrollEnd={(e) => {
              const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setCurrentIndex(newIndex);
            }}
            getItemLayout={(data, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={1} // Only render the current item to avoid OOM
            removeClippedSubviews={Platform.OS === 'android'}
          />
          {/* Internal Toast to ensure visibility over Modal */}
          <Toast />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 20,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  headerBtn: {
    margin: 0,
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  mediaContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullMedia: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  loader: {
    position: 'absolute',
  },
  voiceWrapper: {
    padding: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    alignItems: 'center',
  },
  playBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  waveformContainer: {
    height: 60,
    justifyContent: 'center',
  },
  durationText: {
    color: 'white',
    marginTop: 20,
    fontSize: 18,
    fontWeight: 'bold',
  }
});
