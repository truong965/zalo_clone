// src/modules/message/helpers/message-validation.helper.ts

import { BadRequestException } from '@nestjs/common';
import { MessageType, MediaType } from '@prisma/client';
import { SendMessageDto } from '../dto/send-message.dto';

export const MESSAGE_LIMITS = {
  IMAGE_MAX: 10,
  FILE_MAX: 5,
  VIDEO_MAX: 1,
  VOICE_MAX: 1,
  AUDIO_MAX: 5,
};

export class MessageValidator {
  static validateMessageTypeConsistency(dto: SendMessageDto): void {
    const hasContent = !!dto.content?.trim();
    const hasMedia = dto.mediaIds && dto.mediaIds.length > 0;
    const mediaCount = dto.mediaIds?.length || 0;

    switch (dto.type) {
      case MessageType.TEXT:
        if (hasMedia) {
          throw new BadRequestException(
            'TEXT message cannot have media. Use IMAGE/VIDEO/FILE type for messages with attachments.',
          );
        }
        if (!hasContent) {
          throw new BadRequestException(
            'TEXT message must have non-empty content',
          );
        }
        break;

      case MessageType.IMAGE:
      case MessageType.STICKER:
        if (!hasMedia) {
          throw new BadRequestException(
            `${dto.type} message must have at least 1 media attachment`,
          );
        }
        if (mediaCount > MESSAGE_LIMITS.IMAGE_MAX) {
          throw new BadRequestException(
            `IMAGE message can have max ${MESSAGE_LIMITS.IMAGE_MAX} photos (album limit)`,
          );
        }
        break;

      case MessageType.VIDEO:
        if (!hasMedia || mediaCount !== MESSAGE_LIMITS.VIDEO_MAX) {
          throw new BadRequestException(
            `VIDEO message must have exactly ${MESSAGE_LIMITS.VIDEO_MAX} video file`,
          );
        }
        break;

      case MessageType.FILE:
        if (!hasMedia) {
          throw new BadRequestException(
            'FILE message must have at least 1 document',
          );
        }
        if (mediaCount > MESSAGE_LIMITS.FILE_MAX) {
          throw new BadRequestException(
            `FILE message can have max ${MESSAGE_LIMITS.FILE_MAX} documents`,
          );
        }
        break;

      case MessageType.AUDIO:
        if (!hasMedia) {
          throw new BadRequestException(
            'AUDIO message must have at least 1 audio file',
          );
        }
        if (mediaCount > MESSAGE_LIMITS.AUDIO_MAX) {
          throw new BadRequestException(
            `AUDIO message can have max ${MESSAGE_LIMITS.AUDIO_MAX} audio files`,
          );
        }
        break;

      case MessageType.VOICE:
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

  static validateMediaTypeConsistency(
    messageType: MessageType,
    mediaAttachments: Array<{ mediaType: MediaType }>,
  ): void {
    if (
      messageType === MessageType.TEXT ||
      messageType === MessageType.SYSTEM
    ) {
      return;
    }

    const expectedMediaTypes = this.getExpectedMediaTypes(messageType);

    for (const media of mediaAttachments) {
      if (!expectedMediaTypes.includes(media.mediaType)) {
        throw new BadRequestException(
          `${messageType} message cannot contain ${media.mediaType} files. ` +
          `Expected: ${expectedMediaTypes.join(' or ')}`,
        );
      }
    }

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
