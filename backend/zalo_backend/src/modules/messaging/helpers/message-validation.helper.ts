// src/modules/messaging/helpers/message-validation.helper.ts
// Business rules EXACTLY as specified by user

import { BadRequestException } from '@nestjs/common';
import { MessageType, MediaType } from '@prisma/client';
import { SendMessageDto } from '../dto/send-message.dto';

/**
 * MessageType Validation Helper
 *
 * BUSINESS RULES (from user requirements):
 *
 * 1. TEXT + file → type = file's type (IMAGE/VIDEO/FILE/AUDIO), content = caption
 * 2. Only text → type = TEXT, content = text, mediaIds = []
 * 3. Voice message → type = VOICE, content = null, mediaIds = [audio]
 * 4. Multiple images (album) → type = IMAGE, content = null (or caption), mediaIds = [img1, img2, img3]
 * 5. Mixed file types → split into separate messages
 */
export const MESSAGE_LIMITS = {
  IMAGE_MAX: 10,
  FILE_MAX: 5,
  VIDEO_MAX: 1,
  VOICE_MAX: 1,
};
export class MessageValidator {
  /**
   * Validate message type consistency
   * Called BEFORE creating message
   */
  static validateMessageTypeConsistency(dto: SendMessageDto): void {
    const hasContent = !!dto.content?.trim();
    const hasMedia = dto.mediaIds && dto.mediaIds.length > 0;
    const mediaCount = dto.mediaIds?.length || 0;

    switch (dto.type) {
      case MessageType.TEXT:
        // Rule: TEXT cannot have media
        if (hasMedia) {
          throw new BadRequestException(
            'TEXT message cannot have media. Use IMAGE/VIDEO/FILE type for messages with attachments.',
          );
        }
        // Rule: TEXT must have content
        if (!hasContent) {
          throw new BadRequestException(
            'TEXT message must have non-empty content',
          );
        }
        break;

      case MessageType.IMAGE:
      case MessageType.STICKER:
        // Rule: Must have media
        if (!hasMedia) {
          throw new BadRequestException(
            `${dto.type} message must have at least 1 media attachment`,
          );
        }
        // Rule: IMAGE supports album (up to 10)
        if (mediaCount > MESSAGE_LIMITS.IMAGE_MAX) {
          throw new BadRequestException(
            `IMAGE message can have max ${MESSAGE_LIMITS.IMAGE_MAX} photos (album limit)`,
          );
        }
        // Content is optional (caption)
        break;

      case MessageType.VIDEO:
        // Rule: Must have exactly 1 video
        if (!hasMedia || mediaCount !== MESSAGE_LIMITS.VIDEO_MAX) {
          throw new BadRequestException(
            `VIDEO message must have exactly ${MESSAGE_LIMITS.VIDEO_MAX} video file`,
          );
        }
        // Content is optional (caption)
        break;

      case MessageType.FILE:
        // Rule: Must have media
        if (!hasMedia) {
          throw new BadRequestException(
            'FILE message must have at least 1 document',
          );
        }
        // Rule: Limit to 5 documents
        if (mediaCount > MESSAGE_LIMITS.FILE_MAX) {
          throw new BadRequestException(
            `FILE message can have max  ${MESSAGE_LIMITS.FILE_MAX}  documents`,
          );
        }
        // Content is optional (caption)
        break;

      case MessageType.AUDIO:
        // Rule: Must have media
        if (!hasMedia) {
          throw new BadRequestException(
            'AUDIO message must have at least 1 audio file',
          );
        }
        // Content is optional (caption)
        break;

      case MessageType.VOICE:
        // Rule: Must have exactly 1 audio, no content
        if (!hasMedia || mediaCount !== MESSAGE_LIMITS.VOICE_MAX) {
          throw new BadRequestException(
            `VOICE message must have exactly ${MESSAGE_LIMITS.VOICE_MAX} audio file`,
          );
        }
        if (hasContent) {
          throw new BadRequestException(
            'VOICE message cannot have text content',
          );
        }
        break;

      case MessageType.SYSTEM:
        throw new BadRequestException(
          'SYSTEM messages cannot be sent by users',
        );

      default:
        throw new BadRequestException(
          `Unknown message type: ${dto.type as string}`,
        );
    }
  }

  /**
   * Validate media type consistency
   * Ensure all mediaIds match the declared MessageType
   *
   * Called AFTER fetching media from DB
   */
  static validateMediaTypeConsistency(
    messageType: MessageType,
    mediaAttachments: Array<{ mediaType: MediaType }>,
  ): void {
    // Skip validation for TEXT and SYSTEM (no media expected)
    if (
      messageType === MessageType.TEXT ||
      messageType === MessageType.SYSTEM
    ) {
      return;
    }

    // Map MessageType to expected MediaType(s)
    const expectedMediaTypes = this.getExpectedMediaTypes(messageType);

    for (const media of mediaAttachments) {
      if (!expectedMediaTypes.includes(media.mediaType)) {
        throw new BadRequestException(
          `${messageType} message cannot contain ${media.mediaType} files. ` +
            `Expected: ${expectedMediaTypes.join(' or ')}`,
        );
      }
    }

    // Additional rule: For IMAGE album, all must be IMAGE type
    if (messageType === MessageType.IMAGE && mediaAttachments.length > 1) {
      const allImages = mediaAttachments.every(
        (m) => m.mediaType === MediaType.IMAGE,
      );
      if (!allImages) {
        throw new BadRequestException(
          'IMAGE album must contain only IMAGE files. Mixed media types are not allowed.',
        );
      }
    }
  }

  /**
   * Get expected MediaType(s) for a MessageType
   */
  private static getExpectedMediaTypes(messageType: MessageType): MediaType[] {
    switch (messageType) {
      case MessageType.IMAGE:
      case MessageType.STICKER:
        return [MediaType.IMAGE];

      case MessageType.VIDEO:
        return [MediaType.VIDEO];

      case MessageType.FILE:
        return [MediaType.DOCUMENT];

      case MessageType.AUDIO:
      case MessageType.VOICE:
        return [MediaType.AUDIO];

      default:
        return [];
    }
  }
}
