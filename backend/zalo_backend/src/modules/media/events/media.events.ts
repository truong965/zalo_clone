// src/modules/media/events/media.events.ts
// Event payload interfaces for the media module.
// Emitted via EventEmitter2 using the MEDIA_EVENTS keys from media.constant.ts.

export interface MediaUploadedEvent {
      mediaId: string;
      uploadId: string;
      userId: string;
      mimeType: string;
      mediaType: string;
}

export interface MediaProcessedEvent {
      mediaId: string;
      uploadId: string;
      userId: string;
      thumbnailUrl: string | null;
      cdnUrl: string | null;
}

export interface MediaFailedEvent {
      mediaId: string;
      uploadId: string;
      userId: string;
      reason: string;
}

export interface MediaDeletedEvent {
      mediaId: string;
      userId: string;
}
