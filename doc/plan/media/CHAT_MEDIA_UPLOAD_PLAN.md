# Kế hoạch: Tính năng Upload Media trong Chat

> **Ngày tạo**: 19/02/2026  
> **Phạm vi**: Backend (media + message modules) + Frontend (chat feature)  
> **Mục tiêu**: User có thể chọn tối đa 10 files nhiều kiểu → 1 message với N media attachments → optimistic UI + real-time processing status qua WebSocket.

---

## 1. Phân tích hiện trạng

### 1.1 Backend — Đã có

| Component | Trạng thái | Ghi chú |
|---|---|---|
| `POST /api/v1/media/upload/initiate` | ✅ Hoàn chỉnh | Tạo presigned S3 URL + MediaAttachment record |
| `POST /api/v1/media/upload/confirm` | ✅ Hoàn chỉnh | Verify S3 → enqueue processing worker |
| `POST /messages` (gửi có mediaIds) | ✅ Hoàn chỉnh | `sendMessage` đã nhận `mediaIds: string[]`, link vào message |
| `validateMediaAttachments` | ✅ Có | Kiểm tra media thuộc user, status CONFIRMED/READY |
| `validateMessageTypeConsistency` | ✅ Có | Enforce type-media mapping (xem ràng buộc §1.3) |
| `MessageMediaAttachmentItem` (select) | ✅ Có | Trả về `id, mediaType, cdnUrl, thumbnailUrl, originalName, processingStatus, width, height, duration` |
| WebSocket `progress:{mediaId}` | ✅ SocketGateway | Emit từ consumers via `socketGateway.emitToUser` |

### 1.2 Frontend — Hiện trạng

| Component | Trạng thái |
|---|---|
| `messageService.sendMessage` | ✅ Hỗ trợ `mediaIds` |
| `MessageMediaAttachmentItem` type | ✅ Đã định nghĩa trong `types/api.ts` |
| `message-list.tsx renderMessageBody` | ⚠️ Chỉ hiển thị ảnh (grid) + link cho non-image |
| `ChatInput` | ❌ Chưa có file picker |
| `mediaService` | ❌ Chưa có (`initiateUpload`, `uploadToS3`, `confirmUpload`) |
| `useMediaUpload` hook | ❌ Chưa có |
| `FilePreviewPanel` | ❌ Chưa có |
| Optimistic message cho media | ❌ Chưa có |
| WebSocket `progress:*` listener | ❌ Chưa có |
| `API_ENDPOINTS.MEDIA.INITIATE/CONFIRM` | ❌ Chỉ có `UPLOAD` generic |

### 1.3 Ràng buộc backend quan trọng (cần biết để batch files đúng)

```
MESSAGE_LIMITS = {
  IMAGE_MAX: 10,   // Tối đa 10 ảnh/album
  FILE_MAX: 5,     // Tối đa 5 docs
  VIDEO_MAX: 1,    // Chỉ 1 video/message
  VOICE_MAX: 1,    // Chỉ 1 voice/message
}

MediaType Map:
  MessageType.IMAGE  → MediaType.IMAGE only
  MessageType.VIDEO  → MediaType.VIDEO only (exactly 1)
  MessageType.FILE   → MediaType.DOCUMENT only (max 5)
  MessageType.AUDIO  → MediaType.AUDIO only
  MessageType.TEXT   → KHÔNG có mediaIds
```

**Hệ quả**: Khi user chọn mixed files (ví dụ 2 images + 1 PDF), frontend phải **tách thành nhiều message** (1 IMAGE message + 1 FILE message). Text content gắn vào **batch đầu tiên** theo priority: `IMAGE > VIDEO > FILE > AUDIO`.

---

## 2. Kiến trúc luồng hoàn chỉnh

```
User chọn files (max 10)
        ↓
[FilePreviewPanel] hiển thị thumbnails/icons ngay bằng URL.createObjectURL
        ↓
User bấm Send (Enter / button)
        ↓
┌─────────────────────────────────────────────────────────┐
│ STEP 1: Optimistic UI                                   │
│  → Tạo clientMessageId (UUID) cho mỗi batch            │
│  → Push "pending message bubble" vào messages list       │
│  → Image/Video bubble: hiển thị local preview + blur   │
│  → Doc bubble: file card + linear progress bar         │
└─────────────────────────────────────────────────────────┘
        ↓ (parallel per file)
┌─────────────────────────────────────────────────────────┐
│ STEP 2: Initiate Upload (per file)                      │
│  POST /api/v1/media/upload/initiate                     │
│  → nhận { uploadId, presignedUrl }                     │
└─────────────────────────────────────────────────────────┘
        ↓ (parallel per file)
┌─────────────────────────────────────────────────────────┐
│ STEP 3: Upload to S3 (per file)                         │
│  PUT presignedUrl ← file binary (XHR onUploadProgress) │
│  → Circle progress bar (images) / Linear bar (docs)    │
└─────────────────────────────────────────────────────────┘
        ↓ (parallel per file)
┌─────────────────────────────────────────────────────────┐
│ STEP 4: Confirm Upload (per file)                       │
│  POST /api/v1/media/upload/confirm { uploadId }         │
│  → nhận { mediaAttachment.id, processingStatus }       │
└─────────────────────────────────────────────────────────┘
        ↓ (chờ ALL files trong 1 batch confirmed)
┌─────────────────────────────────────────────────────────┐
│ STEP 5: Send Message (per batch)                        │
│  POST /api/messages  {                                  │
│    conversationId, clientMessageId,                     │
│    type: "IMAGE"|"VIDEO"|"FILE"|"AUDIO",               │
│    content?: "text caption",                            │
│    mediaIds: ["uuid1", "uuid2", ...]                   │
│  }                                                      │
│  → Server returns full message với mediaAttachments     │
│  → Replace optimistic bubble với message thật           │
└─────────────────────────────────────────────────────────┘
        ↓ (async, per mediaId)
┌─────────────────────────────────────────────────────────┐
│ STEP 6: Processing & Real-time Updates                  │
│  WebSocket event: "progress:{mediaId}"                  │
│  {status: 'processing'} → spinner overlay               │
│  {status: 'completed', cdnUrl} → swap local → cdnUrl   │
│  {status: 'failed'} → error icon + Retry button        │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Backend — Thay đổi cần thiết

### 3.1 `message.service.ts` — Bổ sung `size` + `originalName` trong select (Minor)

**File**: `src/modules/message/services/message.service.ts`  
**Vấn đề**: Select hiện tại khi return message chưa include `size` của attachment (cần để hiển thị file card).

```typescript
// Thêm vào tất cả các mediaAttachments select trong sendMessage + getMessages:
mediaAttachments: {
  select: {
    id: true,
    mediaType: true,
    cdnUrl: true,
    thumbnailUrl: true,
    optimizedUrl: true,      // +
    width: true,
    height: true,
    duration: true,
    size: true,              // + cần cho file card
    originalName: true,      // Đã có
    mimeType: true,          // + cần cho icon mapping
    processingStatus: true,
  },
  where: { deletedAt: null },
},
```

### 3.2 `MESSAGE_LIMITS` — Bổ sung `AUDIO_MAX` (Minor)

**File**: `src/modules/message/helpers/message-validation.helper.ts`

```typescript
export const MESSAGE_LIMITS = {
  IMAGE_MAX: 10,
  FILE_MAX: 5,
  VIDEO_MAX: 1,
  VOICE_MAX: 1,
  AUDIO_MAX: 5,  // + (tùy yêu cầu, hiện tại chưa có limit rõ ràng cho AUDIO)
};
```

### 3.3 Frontend `API_ENDPOINTS` — Bổ sung INITIATE/CONFIRM

**File**: `frontend/zalo_clone_web/src/constants/api-endpoints.ts`

```typescript
MEDIA: {
  UPLOAD: '/api/v1/media/upload',
  INITIATE: '/api/v1/media/upload/initiate',  // +
  CONFIRM: '/api/v1/media/upload/confirm',    // +
  DELETE: (id: string) => `/api/v1/media/${id}`,
},
```

### 3.4 Frontend `types/api.ts` — Bổ sung `size`, `mimeType` vào `MessageMediaAttachmentItem`

```typescript
export interface MessageMediaAttachmentItem {
  id: string;
  mediaType: MediaType;
  cdnUrl: string | null;
  thumbnailUrl: string | null;
  optimizedUrl?: string | null;   // +
  originalName: string;
  mimeType?: string;              // +
  size?: number;                  // + (BigInt serialized as string/number)
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  processingStatus: MediaProcessingStatus;
}
```

---

## 4. Frontend — Phases triển khai

### Phase 1 — Services Layer (2-3h)

**File mới**: `frontend/zalo_clone_web/src/services/media.service.ts`

```typescript
export interface InitiateUploadRequest {
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface InitiateUploadResponse {
  uploadId: string;
  presignedUrl: string;
  expiresIn: number;
  s3Key: string;
}

export interface ConfirmUploadResponse {
  id: string;                          // mediaAttachment.id
  uploadId: string;
  processingStatus: MediaProcessingStatus;
  mediaType: MediaType;
  originalName: string;
}

const mediaService = {
  // Bước 1: Lấy presigned URL
  async initiateUpload(dto: InitiateUploadRequest): Promise<InitiateUploadResponse>,

  // Bước 2: Upload trực tiếp lên S3, track progress
  async uploadToS3(
    presignedUrl: string,
    file: File,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<void>,                    // Dùng XMLHttpRequest để có onprogress event

  // Bước 3: Confirm với backend
  async confirmUpload(uploadId: string): Promise<ConfirmUploadResponse>,
};
```

> **Note**: `uploadToS3` phải dùng **XMLHttpRequest** (không phải fetch) để có `xhr.upload.onprogress` callback tracking real progress lên S3.

---

### Phase 2 — `useMediaUpload` Hook (3-4h)

**File mới**: `frontend/zalo_clone_web/src/features/chat/hooks/use-media-upload.ts`

#### Per-file state machine

```
[IDLE]
  ↓ addFiles()
[QUEUED]            → có localUrl (URL.createObjectURL), uploadProgress = 0
  ↓ startUpload()
[INITIATING]        → gọi initiateUpload API
  ↓
[UPLOADING]         → uploadProgress: 0→100, có uploadId
  ↓ S3 upload done
[CONFIRMING]        → gọi confirmUpload API
  ↓
[CONFIRMED]         → có mediaId, processingStatus = PENDING/PROCESSING
  ↓ message sent
[PROCESSING]        → processingStatus = PROCESSING (từ WebSocket)
  ↓ WebSocket done
[DONE]              → processingStatus = READY, cdnUrl available

Tại mọi bước: [ERROR] → có errorMessage + retryCount
```

#### Interface

```typescript
export interface PendingFile {
  localId: string;              // client-side UUID
  file: File;
  localUrl: string;             // URL.createObjectURL(file)
  state: FileUploadState;
  uploadProgress: number;       // 0-100
  uploadId?: string;            // sau initiate
  mediaId?: string;             // sau confirm
  error?: string;
  abortController?: AbortController;
}

export type FileUploadState =
  | 'queued'
  | 'initiating'
  | 'uploading'
  | 'confirming'
  | 'confirmed'
  | 'error';

// Hook return type
interface UseMediaUploadReturn {
  pendingFiles: PendingFile[];
  addFiles: (files: FileList | File[]) => void;
  removeFile: (localId: string) => void;
  retryFile: (localId: string) => Promise<void>;
  clearAll: () => void;
  startUploadAll: () => Promise<string[]>;  // returns mediaIds in order
  isUploading: boolean;
  hasErrors: boolean;
}
```

#### Logic chính

```typescript
// addFiles: validate + reject vượt 10 files tổng, tạo PendingFile[]
// startUploadAll: parallel Promise.all(files.map(uploadSingleFile))
//   uploadSingleFile: initiate → XHR upload → confirm
// retryFile: reset state → uploadSingleFile lại (file còn trong memory)
// cleanup: useEffect → revoke all ObjectURLs khi unmount hoặc clearAll
```

---

### Phase 3 — `FilePreviewPanel` Component (2-3h)

**File mới**: `frontend/zalo_clone_web/src/features/chat/components/file-preview-panel.tsx`

#### Layout

```
┌──────────────────────────────────────────┐
│ [×] [img1] [×] [img2] [×] [doc.pdf] ... │  ← scrollable horizontal
└──────────────────────────────────────────┘
```

#### Per-file card

```tsx
// IMAGE / VIDEO → thumbnail 80x80, với overlay:
//   state=uploading → circular progress (react-circular-progressbar hoặc SVG)
//   state=confirming → small spinner
//   state=confirmed → ✓ green checkmark
//   state=error → ⚠ icon + onClick retry

// DOCUMENT / AUDIO → file-card 200x60:
//   icon (PDF/DOC/XLS/MP3...) + originalName + size
//   linear progress bar (h-1) ở bottom
//   state=confirmed → ✓ green

// × Button trên góc trên-phải mỗi card (remove file)
// Disabled khi state=uploading (không được remove đang upload)
```

**Dependencies cần thêm** (nếu chưa có):
- `lucide-react` hoặc dùng `@ant-design/icons` đã có → dùng ant icons cho đơn giản

---

### Phase 4 — Cập nhật `ChatInput` (2-3h)

**File**: `frontend/zalo_clone_web/src/features/chat/components/chat-input.tsx`

#### Thay đổi

1. **Import `useMediaUpload`** và kết nối state

2. **Hidden file input**:
```tsx
<input
  ref={fileInputRef}
  type="file"
  multiple
  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
  className="hidden"
  onChange={(e) => e.target.files && addFiles(e.target.files)}
/>
```

3. **Toolbar buttons** kích hoạt file picker:
   - `PictureOutlined` → `accept="image/*,video/*"` (override accept rồi click)
   - `PaperClipOutlined` → `accept="application/*,.pdf,audio/*"` (docs + audio)

4. **FilePreviewPanel** render bên trên toolbar khi `pendingFiles.length > 0`:
```tsx
{pendingFiles.length > 0 && (
  <FilePreviewPanel
    files={pendingFiles}
    onRemove={removeFile}
    onRetry={retryFile}
  />
)}
```

5. **Modified `handleSend`**:
```typescript
async function handleSend() {
  if (!conversationId) return;
  const text = message.trim();
  const hasMedia = pendingFiles.length > 0;
  if (!text && !hasMedia) return;

  // 1. Upload all pending files
  let confirmedMediaIds: string[] = [];
  if (hasMedia) {
    try {
      confirmedMediaIds = await startUploadAll(); // parallel
    } catch {
      // errors shown in FilePreviewPanel → user retries per-file
      return;
    }
  }

  // 2. Batch files by type → determine MessageType
  const batches = batchFilesByType(pendingFiles, confirmedMediaIds);

  // 3. Send each batch as a separate message
  for (const batch of batches) {
    const isFirst = batch === batches[0];
    onSend?.({
      type: batch.messageType,
      content: isFirst ? text || undefined : undefined,
      mediaIds: batch.mediaIds,
    });
  }

  // 4. If text only (no media in any batch)
  if (batches.length === 0 && text) {
    onSend?.({ type: 'TEXT', content: text });
  }

  setMessage('');
  clearAll();
}
```

6. **Send button disabled** khi `isUploading`

7. **Prop thay đổi** của `onSend`:
```typescript
// Trước:
onSend?: (text: string) => void;

// Sau (breaking change nhỏ):
onSend?: (payload: {
  type: MessageType;
  content?: string;
  mediaIds?: string[];
}) => void;
```

---

### Phase 5 — `batchFilesByType` Utility (1h)

**File mới**: `frontend/zalo_clone_web/src/features/chat/utils/batch-files.ts`

```typescript
interface FileBatch {
  messageType: MessageType;
  mediaIds: string[];
}

// Priority: IMAGE > VIDEO > FILE > AUDIO (text attached to first batch)
// IMAGE: Nhóm tất cả images, tối đa 10
// VIDEO: Tách từng video thành batch riêng (backend limit = 1/message)
// FILE: Nhóm tất cả docs (pdf/doc/xls...), tối đa 5
// AUDIO: Nhóm tất cả audio, tối đa 5

export function batchFilesByType(
  files: PendingFile[],
  confirmedIds: string[],
): FileBatch[]
```

**MIME → MessageType mapping**:
```typescript
const MIME_TO_MESSAGE_TYPE: Record<string, MessageType> = {
  'image/': 'IMAGE',
  'video/': 'VIDEO',
  'audio/': 'AUDIO',
  'application/pdf': 'FILE',
  'application/msword': 'FILE',
  'application/vnd.openxmlformats': 'FILE',
  'application/vnd.ms-': 'FILE',
  'text/plain': 'FILE',
};
```

---

### Phase 6 — Optimistic Messages trong `useChatMessages` (3-4h)

**File**: `frontend/zalo_clone_web/src/features/chat/hooks/use-chat-messages.ts`

#### Thêm `pendingMessages` state

```typescript
// Optimistic message trước khi server ACK
const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);

// Combined messages = pending (bottom) + server messages
const allMessages = useMemo(() => {
  const serverMessages = /* existing flatten logic */;
  return [...serverMessages, ...pendingMessages];
}, [query.data, pendingMessages]);
```

#### `addOptimisticMessage` function

```typescript
function addOptimisticMessage(payload: {
  clientMessageId: string;
  type: MessageType;
  content?: string;
  localFiles?: PendingFile[];   // để render local preview
}): void {
  const optimistic: ChatMessage = {
    id: clientMessageId,        // temp ID (string bigint)
    clientMessageId,
    conversationId: conversationId!,
    senderId: currentUserId!,
    type: payload.type,
    content: payload.content ?? null,
    createdAt: new Date().toISOString(),
    sender: { id: currentUserId!, displayName: 'You', avatarUrl: null },
    senderSide: 'me',
    displayTimestamp: formatTime(new Date().toISOString()),
    // Local preview attachments (trước khi có server data)
    mediaAttachments: payload.localFiles?.map(f => ({
      id: f.localId,
      mediaType: getMediaTypeFromMime(f.file.type),
      cdnUrl: null,
      thumbnailUrl: null,
      originalName: f.file.name,
      size: f.file.size,
      processingStatus: 'PENDING',
      _localUrl: f.localUrl,    // extra field cho local preview
      _uploadState: f.state,
    })),
    isPending: true,            // UI flag
    _localFiles: payload.localFiles,
  };
  setPendingMessages(prev => [...prev, optimistic]);
}
```

#### Replace optimistic sau khi server ACK

```typescript
// Khi socket nhận NEW_MESSAGE hoặc HTTP response trả về:
function resolveOptimisticMessage(clientMessageId: string, serverMsg: ChatMessage) {
  setPendingMessages(prev => prev.filter(m => m.clientMessageId !== clientMessageId));
  // Server message được upsert vào React Query cache bình thường
}
```

---

### Phase 7 — WebSocket `progress:*` Listener (2-3h)

**File**: `frontend/zalo_clone_web/src/features/chat/hooks/use-chat-messages.ts`  
hoặc tạo hook mới: `use-media-progress.ts`

> **Namespace**: `/socket.io` (đã được xác nhận ở §9 — đồng nhất với toàn bộ hệ thống)

```typescript
// Trong useEffect hoặc custom hook:
socket.on(`progress:${mediaId}`, (update: ProgressUpdate) => {
  // update: { status: 'processing'|'completed'|'failed', progress, thumbnailUrl?, error? }

  queryClient.setQueryData(queryKey, (old: InfiniteData<...>) => {
    // Deep update: tìm message có attachment.id = mediaId → cập nhật processingStatus
    return deepUpdateAttachment(old, mediaId, {
      processingStatus: status === 'completed' ? 'READY' : 'PROCESSING',
      thumbnailUrl: update.thumbnailUrl,
      cdnUrl: update.thumbnailUrl,  // Dùng thumbnailUrl làm preview cho image
    });
  });
});

// Subscribe khi message list load, unsubscribe khi unmount
// Chỉ subscribe cho messages của conversation hiện tại
```

**Vấn đề**: Cần biết `mediaId` nào cần subscribe. Approach:
- Sau khi `confirmUpload` → lưu `mediaId` vào `PendingFile`
- Register listener ngay sau confirm (trước khi send message)
- Unsubscribe sau khi `processingStatus = READY | FAILED`

---

### Phase 8 — Message Rendering Enhancement (3-4h)

**File**: `frontend/zalo_clone_web/src/features/chat/components/message-list.tsx`

#### Tách `renderMessageBody` → dedicated attachment components

**File mới**: `frontend/zalo_clone_web/src/features/chat/components/attachments/`

```
attachments/
  image-attachment.tsx      ← grid thumbnails, local preview + upload progress
  video-attachment.tsx      ← thumbnail + play icon, upload progress
  audio-attachment.tsx      ← AudioPlayer mini (HTML5 <audio>)
  document-attachment.tsx   ← file card: icon + name + size + download link
  processing-overlay.tsx    ← spinner / circular progress cho image/video
```

#### `VideoAttachment` logic

```tsx
// processingStatus = PROCESSING → null thumbnailUrl → hiện video-file icon placeholder
// processingStatus = READY → hiện thumbnailUrl (ảnh tĩnh) + play button overlay
function VideoAttachment({ attachment, localUrl }: Props) {
  const isReady = attachment.processingStatus === 'READY';
  const src = isReady ? (attachment.thumbnailUrl ?? attachment.cdnUrl) : null;

  return (
    <div className="relative rounded-lg overflow-hidden w-48 h-28 bg-gray-800">
      {src ? (
        <img src={src} className="w-full h-full object-cover" />
      ) : (
        // Fallback: video-file icon khi thumbnail chưa có
        <div className="flex items-center justify-center h-full">
          <VideoCameraOutlined className="text-4xl text-gray-400" />
        </div>
      )}
      {isReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <PlayCircleOutlined className="text-white text-3xl drop-shadow" />
        </div>
      )}
      {!isReady && <ProcessingOverlay />}
    </div>
  );
}
```

#### `AudioAttachment` logic

```tsx
// HTML5 native audio player — không custom
function AudioAttachment({ attachment }: Props) {
  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg bg-gray-100 min-w-[220px]">
      <p className="text-xs text-gray-600 truncate">{attachment.originalName}</p>
      {attachment.cdnUrl ? (
        <audio controls src={attachment.cdnUrl} className="w-full h-8" />
      ) : (
        <div className="text-xs text-gray-400">Đang xử lý...</div>
      )}
    </div>
  );
}
```

#### `ImageAttachment` logic

```tsx
function ImageAttachment({ attachment, localUrl }: Props) {
  const isProcessing = attachment.processingStatus === 'PROCESSING';
  const isPending = attachment.processingStatus === 'PENDING';
  const src = attachment.thumbnailUrl ?? attachment.cdnUrl ?? localUrl;

  return (
    <div className="relative rounded-lg overflow-hidden">
      <img
        src={src}
        className={cn('w-full h-32 object-cover', {
          'opacity-50': isPending || isProcessing,
          'filter blur-sm': isPending,
        })}
      />
      {(isPending || isProcessing) && <ProcessingOverlay />}
      {attachment._uploadProgress !== undefined && (
        <CircularProgressbar value={attachment._uploadProgress} />
      )}
      {attachment.processingStatus === 'FAILED' && <ErrorOverlay />}
    </div>
  );
}
```

#### `DocumentAttachment` logic

```tsx
function DocumentAttachment({ attachment, localUrl }: Props) {
  return (
    <div className="relative flex gap-3 p-3 rounded-lg bg-gray-100 min-w-[200px]">
      <FileIcon mimeType={attachment.mimeType} size={32} />
      <div className="flex-1 overflow-hidden">
        <p className="text-sm font-medium truncate">{attachment.originalName}</p>
        <p className="text-xs text-gray-500">{formatFileSize(attachment.size)}</p>
      </div>
      {attachment.cdnUrl && (
        <a href={attachment.cdnUrl} download className="self-center">
          <DownloadOutlined />
        </a>
      )}
      {/* Progress bar khi upload */}
      {attachment._uploadProgress !== undefined && attachment._uploadProgress < 100 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${attachment._uploadProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

---

## 5. File structure tổng thể — Files cần tạo/sửa

```
frontend/zalo_clone_web/src/
├── constants/
│   └── api-endpoints.ts                         SỬAI → thêm INITIATE, CONFIRM
├── types/
│   └── api.ts                                   SỬA → thêm size, mimeType vào MessageMediaAttachmentItem
├── services/
│   └── media.service.ts                         TẠO MỚI
├── features/chat/
│   ├── hooks/
│   │   ├── use-chat-messages.ts                 SỬA → thêm optimistic messages
│   │   ├── use-media-upload.ts                  TẠO MỚI
│   │   └── use-media-progress.ts                TẠO MỚI (optional: tách riêng WebSocket listener)
│   ├── components/
│   │   ├── chat-input.tsx                       SỬA → file picker + preview panel + new onSend
│   │   ├── message-list.tsx                     SỬA → route qua attachment components
│   │   ├── file-preview-panel.tsx               TẠO MỚI
│   │   └── attachments/
│   │       ├── image-attachment.tsx             TẠO MỚI
│   │       ├── video-attachment.tsx             TẠO MỚI
│   │       ├── audio-attachment.tsx             TẠO MỚI
│   │       ├── document-attachment.tsx          TẠO MỚI
│   │       └── processing-overlay.tsx           TẠO MỚI
│   └── utils/
│       └── batch-files.ts                       TẠO MỚI

backend/zalo_backend/src/modules/message/
├── services/
│   └── message.service.ts                       SỬA → thêm size/mimeType vào media select
└── helpers/
    └── message-validation.helper.ts             SỬA → thêm AUDIO_MAX
```

---

## 6. Thứ tự triển khai được đề xuất

| # | Task | Ước tính | Phụ thuộc |
|---|---|---|---|
| 1 | Backend: thêm `size`/`mimeType`/`optimizedUrl` vào message select | 30 phút | — |
| 2 | Frontend: update `API_ENDPOINTS` + `types/api.ts` | 30 phút | — |
| 3 | Frontend: tạo `media.service.ts` | 1-2h | #2 |
| 4 | Frontend: tạo `use-media-upload.ts` hook + state machine | 2-3h | #3 |
| 5 | Frontend: tạo `file-preview-panel.tsx` (UI only, kết nối hook) | 2h | #4 |
| 6 | Frontend: sửa `chat-input.tsx` (file picker + preview + modified onSend) | 2h | #4, #5 |
| 7 | Frontend: tạo `batch-files.ts` util | 1h | #4 |
| 8 | Frontend: sửa `use-chat-messages.ts` (optimistic messages) | 2-3h | #6, #7 |
| 9 | Frontend: tạo attachment components (image/video/audio/doc) | 2-3h | #2 |
| 10 | Frontend: sửa `message-list.tsx` (route qua attachment components) | 1h | #9 |
| 11 | Frontend: tạo `use-media-progress.ts` (WebSocket progress listener) | 2h | #8 |
| 12 | End-to-end test + xử lý edge cases | 2h | All |

**Tổng ước tính**: ~20-25 giờ dev

---

## 7. Edge Cases & Constraints

| Trường hợp | Xử lý |
|---|---|
| User chọn video và ảnh cùng lúc | Batch thành: 1 IMAGE msg + N VIDEO msgs (mỗi video 1 msg) |
| Upload 1 file fail (mạng đứt) | Không block các file khác; hiện error overlay + Retry button. Chỉ block Send nếu còn file đang lỗi. |
| User close browser giữa chừng | File đang upload cancel (AbortController.abort()). S3 cleanup job sẽ dọn temp files sau 24h. |
| File > giới hạn backend (ví dụ > 50MB) | Client-side validation trước khi initiate. Hiện toast error + không add vào queue. |
| File tên có ký tự đặc biệt | Backend `fileName` regex `^[a-zA-Z0-9._-\s()]+$` — frontend phải sanitize hoặc reject |
| Thêm file trong lúc đang upload batch trước | Không cho phép — disable file picker khi `isUploading = true` |
| Retry file: file đã bị GC (browser) | Không xảy ra vì `PendingFile.file` giữ reference trong state cho đến khi `clearAll()` |
| WebSocket disconnect giữa processing | Poll `GET /api/v1/media/:id` sau 5s timeout nếu không nhận `progress:*` event |
| VIDEO max = 1/msg + user chọn 3 videos | Tự động batch → 3 messages VIDEO riêng biệt |
| Quá 10 file selected | Chỉ lấy 10 file đầu tiên + hiện toast warning "Tối đa 10 files" |

---

## 8. Dependencies frontend cần kiểm tra

```bash
# Kiểm tra xem đã có chưa (package.json)
- uuid / @paralleldrive/cuid2  → generate clientMessageId
- class-variance-authority / clsx + tailwind-merge → conditional classes (cn)
- XMLHttpRequest → built-in, không cần package

# Không nên thêm:
- Không cần react-circular-progressbar (SVG custom đơn giản hơn)
- Không cần file-type package (dùng MIME từ File.type)
```

---

## 9. Quyết định thiết kế đã được xác nhận

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Caption per file hay caption chung? | **Caption chung**: 1 text caption cho toàn bộ lần Send, gắn vào batch đầu tiên theo priority `IMAGE > VIDEO > FILE > AUDIO`. Các batch sau không có text. |
| 2 | Socket namespace? | **`/socket.io`** — đồng nhất với tất cả modules khác. KHÔNG dùng `/ws`. Mọi `socket.on('progress:...')` đều trên namespace này. |
| 3 | Video thumbnail khi đang processing? | **Chấp nhận fallback**: `processingStatus = PROCESSING` → hiện video-file icon placeholder. Khi worker trả READY + `thumbnailUrl` → swap sang thumbnail thật. |
| 4 | Audio player UI? | **HTML5 native**: `<audio controls>` mặc định. Không cần custom player. |
