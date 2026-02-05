import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorator/customize';
import { PrivacyService } from './services/privacy.service';
import type { User } from '@prisma/client';
import { UpdatePrivacySettingsDto } from './dto/privacy.dto';

/**
 * Privacy Controller - Handle privacy settings endpoints
 *
 * PHASE 1: Basic CRUD operations
 * - GET /api/privacy: Get my privacy settings
 * - PATCH /api/privacy: Update my privacy settings
 */
@ApiTags('Privacy')
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  /**
   * Get privacy settings for current user
   */
  @Get()
  @ApiOperation({ summary: 'Get my privacy settings' })
  async getPrivacySettings(@CurrentUser() user: User) {
    return this.privacyService.getSettings(user.id);
  }

  /**
   * Update privacy settings for current user
   */
  @Patch()
  @ApiOperation({ summary: 'Update privacy settings' })
  async updatePrivacySettings(
    @CurrentUser() user: User,
    @Body() dto: UpdatePrivacySettingsDto,
  ) {
    return this.privacyService.updateSettings(user.id, dto);
  }
}
