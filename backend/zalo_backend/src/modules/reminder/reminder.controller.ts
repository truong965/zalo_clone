/**
 * ReminderController — REST API for reminder CRUD.
 *
 * Routes:
 *   POST   /api/v1/reminders           → create
 *   GET    /api/v1/reminders           → findAll (query ?includeCompleted=true)
 *   GET    /api/v1/reminders/:id       → findOne
 *   PATCH  /api/v1/reminders/:id       → update
 *   DELETE /api/v1/reminders/:id       → remove
 */

import {
      Controller,
      Get,
      Post,
      Patch,
      Delete,
      Body,
      Param,
      Query,
      ParseUUIDPipe,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorator/customize';
import { ReminderService } from './services/reminder.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

@Controller('reminders')
export class ReminderController {
      constructor(private readonly reminderService: ReminderService) { }

      @Post()
      create(@CurrentUser() user, @Body() dto: CreateReminderDto) {
            return this.reminderService.create(user.id, dto);
      }

      @Get()
      findAll(
            @CurrentUser() user,
            @Query('includeCompleted') includeCompleted?: string,
      ) {
            return this.reminderService.findAll(user.id, includeCompleted === 'true');
      }

      @Get('undelivered')
      findUndelivered(@CurrentUser() user) {
            return this.reminderService.findUndelivered(user.id);
      }

      @Get('conversation/:conversationId')
      findByConversation(
            @CurrentUser() user,
            @Param('conversationId', ParseUUIDPipe) conversationId: string,
      ) {
            return this.reminderService.findByConversation(user.id, conversationId);
      }

      @Get(':id')
      findOne(
            @CurrentUser() user,
            @Param('id', ParseUUIDPipe) id: string,
      ) {
            return this.reminderService.findOne(user.id, id);
      }

      @Patch(':id')
      update(
            @CurrentUser() user,
            @Param('id', ParseUUIDPipe) id: string,
            @Body() dto: UpdateReminderDto,
      ) {
            return this.reminderService.update(user.id, id, dto);
      }

      @Delete(':id')
      remove(
            @CurrentUser() user,
            @Param('id', ParseUUIDPipe) id: string,
      ) {
            return this.reminderService.remove(user.id, id);
      }
}
