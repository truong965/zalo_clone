import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Message, MessageMediaAttachmentItem } from '@/types/message';
import { mobileApi } from '@/services/api';

// ─── URL ────────────────────────────────────────────────────────────────────

export function getFullUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://') || url.startsWith('content://') || url.startsWith('data:')) return url;
  return `${mobileApi.baseUrl}${url}`;
}

// ─── Receipt / Send status ───────────────────────────────────────────────────

export type ReceiptDisplayState = 'none' | 'sent' | 'delivered' | 'seen';

export function getSendStatus(metadata: Record<string, unknown> | undefined): string | undefined {
  if (!metadata) return undefined;
  const v = metadata.sendStatus;
  return typeof v === 'string' ? v : undefined;
}

export function getReceiptDisplayState(msg: Message, isDirect: boolean): ReceiptDisplayState {
  const sendStatus = getSendStatus(msg.metadata);
  if (sendStatus === 'SENDING' || sendStatus === 'FAILED') return 'none';

  if (isDirect) {
    const receipts = msg.directReceipts;
    if (!receipts) return 'sent';
    const entries = Object.values(receipts);
    if (entries.length === 0) return 'sent';
    if (entries.some((e) => e.seen !== null)) return 'seen';
    if (entries.some((e) => e.delivered !== null)) return 'delivered';
    return 'sent';
  }

  const total = msg.totalRecipients || 0;
  if (total === 0) return 'sent';
  if (Math.min(msg.seenCount || 0, total) > 0) return 'seen';
  if ((msg.deliveredCount || 0) > 0) return 'delivered';
  return 'sent';
}

// ─── Audio ──────────────────────────────────────────────────────────────────

export function formatAudioDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── File / Document ─────────────────────────────────────────────────────────

export function formatFileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function getFileIcon(fileName: string): {
  name: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
} {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':   return { name: 'file-pdf-box',        color: '#ff4444' };
    case 'doc':
    case 'docx':  return { name: 'file-word-box',       color: '#2b579a' };
    case 'xls':
    case 'xlsx':  return { name: 'file-excel-box',      color: '#217346' };
    case 'ppt':
    case 'pptx':  return { name: 'file-powerpoint-box', color: '#d24726' };
    case 'zip':
    case 'rar':
    case '7z':    return { name: 'folder-zip',          color: '#ffb900' };
    case 'txt':   return { name: 'file-document-outline', color: '#666'  };
    case 'jpg':
    case 'jpeg':
    case 'png':   return { name: 'file-image-outline',  color: '#4caf50' };
    default:      return { name: 'file-outline',        color: '#0091ff' };
  }
}
// ─── Reply ──────────────────────────────────────────────────────────────────

export function getMessagePreviewText(
  msg: { 
    content?: string | null; 
    deletedAt?: string | null; 
    metadata?: Record<string, unknown> | null;
    type?: string;
    mediaAttachments?: Array<{ mediaType: string; originalName: string }> | null 
  }
): string {
  if (msg.metadata && msg.metadata.recalled === true) {
    return 'Tin nhắn đã được thu hồi';
  }
  if (msg.deletedAt) return 'Tin nhắn đã bị xóa';
  
  // 1. Prioritize text content (caption or text message)
  if (msg.content && msg.content.trim().length > 0) {
    return msg.content;
  }
  
  // 2. Fallback to media attachments label
  const attachments = msg.mediaAttachments || [];
  if (attachments.length > 0) {
    const first = attachments[0];
    if (first.mediaType === 'IMAGE') return '🖼️ Hình ảnh';
    if (first.mediaType === 'VIDEO') return '🎥 Video';
    if (first.mediaType === 'AUDIO') return '🎵 Tin nhắn thoại';
    if (first.mediaType === 'DOCUMENT') return `📄 ${first.originalName || 'Tệp tin'}`;
    return '📎 Tập tin';
  }

  // 3. Last resort fallback based on message type
  if (msg.type === 'IMAGE') return '🖼️ Hình ảnh';
  if (msg.type === 'VIDEO') return '🎥 Video';
  if (msg.type === 'AUDIO' || msg.type === 'VOICE') return '🎵 Tin nhắn thoại';
  if (msg.type === 'FILE') return '📎 Tệp tin';
  
  return '';
}

export function getReplyPreviewText(
  msg: { 
    content?: string | null; 
    deletedAt?: string | null; 
    metadata?: Record<string, unknown> | null;
    type?: string;
    mediaAttachments?: Array<{ mediaType: string; originalName: string }> | null 
  }
): string {
  return getMessagePreviewText(msg) || 'Tin nhắn';
}

export function getReplyIconName(
  msg: { type?: string; mediaAttachments?: Array<{ mediaType: string }> | null }
): string {
  const attachments = msg.mediaAttachments || [];
  if (attachments.length === 0) {
    if (msg.type === 'VOICE' || msg.type === 'AUDIO') return "mic-outline";
    return "arrow-undo-outline";
  }
  
  const first = attachments[0];
  if (first.mediaType === 'IMAGE') return "image-outline";
  if (first.mediaType === 'VIDEO') return "videocam-outline";
  if (first.mediaType === 'AUDIO') return "mic-outline";
  return "document-text-outline";
}
