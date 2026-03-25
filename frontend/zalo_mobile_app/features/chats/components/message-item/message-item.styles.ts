import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  // ─── Row & layout ──────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  rowMe:    { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },

  avatarWrapper: {
    marginRight: 10,
    alignSelf: 'flex-end',
  },
  bubbleColumn: { maxWidth: '78%' },

  // ─── Sender name ───────────────────────────────────────────────────────────
  senderName: {
    color: '#6b7280',
    fontSize: 11,
    marginBottom: 4,
    marginLeft: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ─── Bubble ────────────────────────────────────────────────────────────────
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  highlighted: {
    backgroundColor: '#fff9c4', // Light yellow flash
    borderColor: '#fbc02d',
  },
  bubbleMe: {
    backgroundColor: '#dcf1ff',
    borderColor: '#b9e3fe',
  },
  bubbleOther: {
    backgroundColor: '#ffffff',
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleCornerMe:    { borderTopRightRadius: 4 },
  bubbleCornerOther: { borderTopLeftRadius: 4 },

  // ─── Time & status ─────────────────────────────────────────────────────────
  timeRow:      { flexDirection: 'row', marginTop: 4 },
  timeRowMe:    { justifyContent: 'flex-end',  marginRight: 4 },
  timeRowOther: { justifyContent: 'flex-start', marginLeft: 4 },
  timeText:   { fontSize: 10, color: '#9ca3af', fontWeight: '500' },
  statusText: { fontSize: 10, color: '#9ca3af', marginLeft: 4 },
  statusSeen: { fontSize: 10, color: '#3b82f6', marginLeft: 4, fontWeight: '600' },
  statusError:{ fontSize: 10, color: '#ef4444', marginLeft: 4 },

  // ─── Text ──────────────────────────────────────────────────────────────────
  messageText: { fontSize: 16, color: '#081c36', lineHeight: 22 },

  // ─── Image ─────────────────────────────────────────────────────────────────
  imageWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  image: { width: 220, height: 220 },

  // ─── Video ─────────────────────────────────────────────────────────────────
  videoWrapper: {
    width: 224,
    height: 224,
    backgroundColor: 'rgba(0,0,0,0.9)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonWrapper: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 16,
    borderRadius: 999,
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDurationText: { color: '#fff', fontSize: 10 },

  // ─── Audio ─────────────────────────────────────────────────────────────────
  audioWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    minWidth: 180,
  },
  audioPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  audioWaveWrapper: { flex: 1, marginHorizontal: 12, justifyContent: 'center' },
  audioWave: { flexDirection: 'row', alignItems: 'center', height: 24, gap: 3 },
  audioBar:  { width: 3, borderRadius: 999 },
  audioDuration: { fontSize: 12, fontWeight: '700' },

  // ─── Document ──────────────────────────────────────────────────────────────
  docWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 240,
  },
  docBody: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  docIconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docInfo:     { marginLeft: 12, flex: 1 },
  docName:     { fontWeight: '700', fontSize: 15, color: '#1a1a1a' },
  docSize:     { fontSize: 12, marginTop: 2, color: '#6b7280', fontWeight: '500' },
  docDownload: { padding: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.03)', marginLeft: 8 },

  // ─── Reply ─────────────────────────────────────────────────────────────────
  replyContainer: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderLeftWidth: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 4,
  },
  replySender:  { fontSize: 12, fontWeight: 'bold', color: '#374151' },
  replyContent: { fontSize: 12, color: '#6b7280' },

  // ─── Error State ───────────────────────────────────────────────────────────
  errorWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '500',
  },
  retryBtn: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  retryText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '700',
  },
});
