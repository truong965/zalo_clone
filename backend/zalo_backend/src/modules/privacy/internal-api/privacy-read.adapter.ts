import { Injectable } from '@nestjs/common';
import { IPrivacyReadPort } from '@common/contracts/internal-api';
import type { PrivacySettingsResponseDto } from '../dto/privacy.dto';
import { PrivacyService } from '../services/privacy.service';

@Injectable()
export class PrivacyReadAdapter implements IPrivacyReadPort {
  constructor(private readonly privacyService: PrivacyService) {}

  getSettings(userId: string): Promise<PrivacySettingsResponseDto> {
    return this.privacyService.getSettings(userId);
  }

  getManySettings(
    userIds: string[],
  ): Promise<Map<string, PrivacySettingsResponseDto>> {
    return this.privacyService.getManySettings(userIds);
  }
}
