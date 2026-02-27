// src/modules/message/dto/recent-media.dto.ts

import { IsUUID, IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO: Query parameters for GET /messages/conversations/:conversationId/media/recent
 *
 * Fetches the N most recent media messages (IMAGE, VIDEO, FILE, AUDIO)
 * in a conversation. Used by the info sidebar to show a quick preview,
 * and by the Media Browser panel with cursor pagination.
 */
export class RecentMediaQueryDto {
  /**
   * Comma-separated MessageType values to filter.
   * Accepted: IMAGE, VIDEO, FILE, AUDIO
   * @example "IMAGE,VIDEO"
   */
  @IsOptional()
  @IsString()
  types?: string;

  /**
   * Number of items to return (default 3, max 50).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 3;

  /**
   * Cursor for pagination — base64-encoded JSON { lastCreatedAt, lastId }.
   * When provided, returns items older than the cursor.
   */
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * Optional keyword to filter by original filename (ILIKE match).
   * Useful for FILE search where users know the filename.
   */
  @IsOptional()
  @IsString()
  keyword?: string;
}

/**
 * Shape of each item returned by the recent-media endpoint.
 * Kept as a plain interface (not a class) since it is only used as an
 * output shape — no validation decorators needed.
 */
export interface RecentMediaItemDto {
  messageId: string;
  mediaId: string;
  originalName: string;
  mimeType: string;
  mediaType: string;
  size: number;
  thumbnailUrl: string | null;
  cdnUrl: string | null;
  messageType: string;
  createdAt: Date;
}
