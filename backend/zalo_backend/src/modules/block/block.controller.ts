import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorator/customize';
import { BlockService } from './block.service';
import type { User } from '@prisma/client';

import { BlockUserDto, GetBlockedListQueryDto } from './dto/block.dto';
import { BlockAuthorizationHelper } from './services/block-authorization.helper';

@ApiTags('Block Management')
@ApiBearerAuth() // All endpoints require JWT authentication
@Controller('block')
export class BlockController {
  constructor(
    private readonly blockService: BlockService,
    private readonly authHelper: BlockAuthorizationHelper,
  ) { }

  // ==============================
  // 1. BLOCKING OPERATIONS
  // ==============================

  /**
   * Block a user (Idempotent + Authorized + Rate Limited)
   *
   * Authorization checks:
   * - User account must be ACTIVE
   * - Cannot block yourself
   * - Rate limited: max 10 blocks per minute
   *
   * Response:
   * - If already blocked: Returns existing block (idempotent)
   * - If newly blocked: Creates and returns new block with event cascade
   *
   * Events triggered: user.blocked (with cascade operations)
   *
   * @param user - Current authenticated user
   * @param dto - Block request with targetUserId and optional reason
   * @returns BlockResponseDto with block record details
   */
  @Post('block')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Block a user',
    description:
      'Block a user with authorization, rate limiting, and idempotency',
  })
  @ApiCreatedResponse({
    description: 'User blocked successfully (or already blocked - idempotent)',
    schema: {
      example: {
        id: 'uuid',
        blockerId: 'user-1',
        blockedId: 'user-2',
        reason: 'Spam',
        createdAt: '2026-02-04T10:00:00Z',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request (missing fields, invalid UUID)',
  })
  @ApiForbiddenResponse({
    description: 'Account inactive or self-blocking attempt',
  })
  @ApiUnauthorizedResponse({
    description: 'User not authenticated',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (max 10 blocks per minute)',
  })
  @ApiInternalServerErrorResponse({
    description: 'Server error during block operation',
  })
  async blockUser(@CurrentUser() user: User, @Body() dto: BlockUserDto) {
    // Authorization: Validate account and parameters
    this.authHelper.validateBlockOperation(user, dto.targetUserId);

    return this.blockService.blockUser(user.id, dto);
  }

  /**
   * Unblock a user (Idempotent + Authorized)
   *
   * Authorization checks:
   * - User account must be ACTIVE
   * - Cannot unblock yourself
   *
   * Response:
   * - If not blocked: Returns successfully (idempotent)
   * - If was blocked: Deletes block and returns successfully
   *
   * Events triggered: user.unblocked (with cascade cleanup)
   *
   * @param user - Current authenticated user
   * @param targetUserId - UUID of user to unblock
   * @returns 204 No Content
   */
  @Delete('block/:targetUserId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unblock a user',
    description: 'Unblock a user with authorization and idempotency',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'User unblocked successfully (or never blocked - idempotent)',
  })
  @ApiBadRequestResponse({
    description: 'Invalid UUID format',
  })
  @ApiForbiddenResponse({
    description: 'Account inactive or self-unblock attempt',
  })
  @ApiUnauthorizedResponse({
    description: 'User not authenticated',
  })
  @ApiParam({
    name: 'targetUserId',
    type: 'string',
    format: 'uuid',
    description: 'UUID of the user to unblock',
    example: 'uuid-v4-format',
  })
  @ApiInternalServerErrorResponse({
    description: 'Server error during unblock operation',
  })
  async unblockUser(
    @CurrentUser() user: User,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ) {
    // Authorization: Validate account and parameters
    this.authHelper.validateUnblockOperation(user, targetUserId);

    return this.blockService.unblockUser(user.id, targetUserId);
  }

  // ==============================
  // 2. QUERYING BLOCK STATUS (Infinity Scroll)
  // ==============================

  /**
   * Get list of users blocked BY current user (Infinity Scroll)
   *
   * Cursor-based pagination for optimal performance:
   * - No offset calculation (O(1) performance)
   * - Efficient for large datasets
   * - Handles real-time additions/deletions gracefully
   * - Ordered by most recent blocks first
   *
   * @param user - Current authenticated user
   * @param query - Cursor pagination query (limit, cursor)
   * @returns CursorPaginatedResult<BlockedUserDto>
   *
   * @example
   * // First request
   * GET /block/blocked?limit=20
   * Response:
   * {
   *   "data": [
   *     {
   *       "blockId": "uuid",
   *       "userId": "uuid",
   *       "displayName": "User Name",
   *       "avatarUrl": "https://...",
   *       "blockedAt": "2026-02-04T10:00:00Z",
   *       "reason": "Spam"
   *     }
   *   ],
   *   "meta": {
   *     "limit": 20,
   *     "hasNextPage": true,
   *     "nextCursor": "uuid"
   *   }
   * }
   *
   * // Next request
   * GET /block/blocked?limit=20&cursor=uuid
   */
  @Get('blocked')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get list of blocked users (cursor pagination)',
    description:
      'Get a paginated list of all users blocked by the current user using cursor-based pagination',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of blocked users with pagination metadata',
    schema: {
      example: {
        data: [
          {
            blockId: 'uuid',
            userId: 'uuid',
            displayName: 'User Name',
            avatarUrl: 'https://example.com/avatar.jpg',
            blockedAt: '2026-02-04T10:00:00Z',
            reason: 'Spam content',
          },
        ],
        meta: {
          limit: 20,
          hasNextPage: true,
          nextCursor: 'next-cursor-uuid',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid pagination parameters (limit out of range, invalid cursor)',
  })
  @ApiUnauthorizedResponse({
    description: 'User not authenticated',
  })
  @ApiQuery({
    name: 'limit',
    type: 'number',
    required: false,
    description: 'Number of items to return (1-100, default 20)',
    example: 20,
  })
  @ApiQuery({
    name: 'cursor',
    type: 'string',
    required: false,
    description: 'Cursor from previous response for pagination',
    example: 'uuid-v4-format',
  })
  async getBlockedUsers(
    @CurrentUser() user: User,
    @Query() query: GetBlockedListQueryDto,
  ) {
    return await this.blockService.getBlockedList(user.id, query);
  }

  /**
   * Get list of users who blocked current user
   *
   * Reverse lookup - useful for:
   * - Privacy checks
   * - Deciding visibility of content
   * - Preventing interactions with users who blocked you
   *
   * Note: No pagination (assumed to be a small list)
   *
   * @param user - Current authenticated user
   * @returns Array of user IDs who blocked current user
   */
  @Get('blocked-by')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get list of users who blocked me',
    description: 'Get list of user IDs who have blocked the current user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Array of user IDs who blocked current user',
    schema: {
      example: ['user-uuid-1', 'user-uuid-2'],
      type: 'array',
      items: { type: 'string' },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'User not authenticated',
  })
  @ApiInternalServerErrorResponse({
    description: 'Server error retrieving blocked-by list',
  })
  async getBlockedByUsers(@CurrentUser() user: User) {
    return await this.blockService.getBlockedByUsers(user.id);
  }
}
