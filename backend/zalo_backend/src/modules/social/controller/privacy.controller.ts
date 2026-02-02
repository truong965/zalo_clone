import { Controller, Get, Patch, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorator/customize';

import { PrivacyService } from '../service/privacy.service';
import type { User } from '@prisma/client';

import { UpdatePrivacySettingsDto } from '../dto/privacy.dto';

@ApiTags('Social - privacy')
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  // ==============================
  // 4. PRIVACY
  // ==============================

  @Get()
  @ApiOperation({ summary: 'Get my privacy settings' })
  async getPrivacySettings(@CurrentUser() user: User) {
    return this.privacyService.getSettings(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update privacy settings' })
  async updatePrivacySettings(
    @CurrentUser() user: User,
    @Body() dto: UpdatePrivacySettingsDto,
  ) {
    return this.privacyService.updateSettings(user.id, dto);
  }
}
