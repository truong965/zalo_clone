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
import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { SyncContactsDto, UpdateContactAliasDto } from './dto/contact.dto';

@ApiTags('Social - Contacts')
@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post('sync')
  @ApiOperation({ summary: 'Sync phone contacts from mobile device' })
  async syncContacts(@CurrentUser() user: User, @Body() dto: SyncContactsDto) {
    return this.contactService.syncContacts(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get synced contacts' })
  async getContacts(
    @CurrentUser() user: User,
    @Query() query: CursorPaginationDto,
  ) {
    return this.contactService.getContacts(user.id, query);
  }

  @Patch(':contactId/alias')
  @ApiOperation({ summary: 'Set a custom alias name for a contact' })
  async updateAlias(
    @CurrentUser() user: User,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() dto: UpdateContactAliasDto,
  ) {
    return this.contactService.updateAlias(user.id, contactId, dto.aliasName);
  }

  @Delete(':contactId')
  @ApiOperation({ summary: 'Remove a contact sync record' })
  async removeContact(
    @CurrentUser() user: User,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.contactService.removeContact(user.id, contactId);
  }
}
