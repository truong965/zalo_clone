import {
  Controller,
  Post,
  Body,
  Patch,
  Delete,
  Get,
  Query,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CurrentUser } from 'src/common/decorator/customize';
import type { User } from '@prisma/client';
import { SyncContactsDto, UpdateContactAliasDto, GetContactsQueryDto } from './dto/contact.dto';

@ApiTags('Social - Contacts')
@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) { }

  @Post('sync')
  @ApiOperation({ summary: 'Sync phone contacts from mobile device' })
  async syncContacts(@CurrentUser() user: User, @Body() dto: SyncContactsDto) {
    return this.contactService.syncContacts(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get synced contacts' })
  async getContacts(
    @CurrentUser() user: User,
    @Query() query: GetContactsQueryDto,
  ) {
    return this.contactService.getContacts(user.id, query);
  }

  // MUST be declared before :contactUserId param routes to avoid route conflict
  @Get('check/:targetUserId')
  @ApiOperation({ summary: 'Check if a user is saved as contact' })
  async checkIsContact(
    @CurrentUser() user: User,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.contactService.checkIsContact(user.id, targetUserId);
  }

  // B5 fix: renamed param from :contactId → :contactUserId (the value IS the target user's ID)
  @Patch(':contactUserId/alias')
  @ApiOperation({ summary: 'Set a custom alias name for a contact' })
  async updateAlias(
    @CurrentUser() user: User,
    @Param('contactUserId', ParseUUIDPipe) contactUserId: string,
    @Body() dto: UpdateContactAliasDto,
  ) {
    return this.contactService.updateAlias(user.id, contactUserId, dto.aliasName);
  }

  @Delete(':contactUserId')
  @ApiOperation({ summary: 'Remove a contact sync record' })
  async removeContact(
    @CurrentUser() user: User,
    @Param('contactUserId', ParseUUIDPipe) contactUserId: string,
  ) {
    return this.contactService.removeContact(user.id, contactUserId);
  }
}
