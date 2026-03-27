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
    const hasMedia = !!(dto.mediaIds && dto.mediaIds.length > 0);
    const mediaCount = dto.mediaIds?.length || 0;

    switch (dto.type) {
      case MessageType.TEXT:
        this.validateTextMessage(hasContent, hasMedia);
        break;
      case MessageType.IMAGE:
      case MessageType.STICKER:
        this.validateImageMessage(dto.type, hasMedia, mediaCount);
        break;
      case MessageType.VIDEO:
        this.validateExactMediaCount(
          hasMedia,
          mediaCount,
          MESSAGE_LIMITS.VIDEO_MAX,
          'VIDEO',
          'video file',
        );
        break;
      case MessageType.FILE:
        this.validateMediaRange(
          hasMedia,
          mediaCount,
          MESSAGE_LIMITS.FILE_MAX,
          'FILE',
          'document',
        );
        break;
      case MessageType.AUDIO:
        this.validateMediaRange(
          hasMedia,
          mediaCount,
          MESSAGE_LIMITS.AUDIO_MAX,
          'AUDIO',
          'audio file',
        );
        break;
      case MessageType.VOICE:
        this.validateVoiceMessage(hasContent, hasMedia, mediaCount);
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

  private static validateTextMessage(
    hasContent: boolean,
    hasMedia: boolean,
  ): void {
    if (hasMedia) {
      throw new BadRequestException(
        'TEXT message cannot have media. Use IMAGE/VIDEO/FILE type for messages with attachments.',
      );
    }
    if (!hasContent) {
      throw new BadRequestException('TEXT message must have non-empty content');
    }
  }

  private static validateImageMessage(
    type: string,
    hasMedia: boolean,
    mediaCount: number,
  ): void {
    if (!hasMedia) {
      throw new BadRequestException(
        `${type} message must have at least 1 media attachment`,
      );
    }
    if (mediaCount > MESSAGE_LIMITS.IMAGE_MAX) {
      throw new BadRequestException(
        `IMAGE message can have max ${MESSAGE_LIMITS.IMAGE_MAX} photos (album limit)`,
      );
    }
  }

  private static validateExactMediaCount(
    hasMedia: boolean,
    mediaCount: number,
    exact: number,
    typeName: string,
    fileLabel: string,
  ): void {
    if (!hasMedia || mediaCount !== exact) {
      throw new BadRequestException(
        `${typeName} message must have exactly ${exact} ${fileLabel}`,
      );
    }
  }

  private static validateMediaRange(
    hasMedia: boolean,
    mediaCount: number,
    max: number,
    typeName: string,
    fileLabel: string,
  ): void {
    if (!hasMedia) {
      throw new BadRequestException(
        `${typeName} message must have at least 1 ${fileLabel}`,
      );
    }
    if (mediaCount > max) {
      throw new BadRequestException(
        `${typeName} message can have max ${max} ${fileLabel}s`,
      );
    }
  }

  private static validateVoiceMessage(
    hasContent: boolean,
    hasMedia: boolean,
    mediaCount: number,
  ): void {
    if (!hasMedia || mediaCount !== MESSAGE_LIMITS.VOICE_MAX) {
      throw new BadRequestException(
        `VOICE message must have exactly ${MESSAGE_LIMITS.VOICE_MAX} audio file`,
      );
    }
    if (hasContent) {
      throw new BadRequestException('VOICE message cannot have text content');
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
        return [
          MediaType.IMAGE,
          MediaType.VIDEO,
          MediaType.AUDIO,
          MediaType.DOCUMENT,
        ];

      case MessageType.AUDIO:
      case MessageType.VOICE:
        return [MediaType.AUDIO];

      default:
        return [];
    }
  }
}
