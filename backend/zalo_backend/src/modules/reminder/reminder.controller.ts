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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReminderService } from './services/reminder.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

@ApiTags('Reminders')
@ApiBearerAuth()
@Controller('reminders')
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @ApiOperation({ summary: 'Create a new reminder' })
  @Post()
  create(@CurrentUser() user, @Body() dto: CreateReminderDto) {
    return this.reminderService.create(user.id, dto);
  }

  @ApiOperation({ summary: 'List all reminders for the current user' })
  @ApiQuery({
    name: 'includeCompleted',
    required: false,
    description: 'Include completed reminders',
  })
  @Get()
  findAll(
    @CurrentUser() user,
    @Query('includeCompleted') includeCompleted?: string,
  ) {
    return this.reminderService.findAll(user.id, includeCompleted === 'true');
  }

  @ApiOperation({ summary: 'Get reminders that have not yet been delivered' })
  @Get('undelivered')
  findUndelivered(@CurrentUser() user) {
    return this.reminderService.findUndelivered(user.id);
  }

  @ApiOperation({ summary: 'Get reminders for a specific conversation' })
  @ApiParam({ name: 'conversationId', description: 'Conversation UUID' })
  @Get('conversation/:conversationId')
  findByConversation(
    @CurrentUser() user,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ) {
    return this.reminderService.findByConversation(user.id, conversationId);
  }

  @ApiOperation({ summary: 'Get a single reminder by ID' })
  @ApiParam({ name: 'id', description: 'Reminder UUID' })
  @Get(':id')
  findOne(@CurrentUser() user, @Param('id', ParseUUIDPipe) id: string) {
    return this.reminderService.findOne(user.id, id);
  }

  @ApiOperation({ summary: 'Update a reminder' })
  @ApiParam({ name: 'id', description: 'Reminder UUID' })
  @Patch(':id')
  update(
    @CurrentUser() user,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.reminderService.update(user.id, id, dto);
  }

  @ApiOperation({ summary: 'Delete a reminder' })
  @ApiParam({ name: 'id', description: 'Reminder UUID' })
  @Delete(':id')
  remove(@CurrentUser() user, @Param('id', ParseUUIDPipe) id: string) {
    return this.reminderService.remove(user.id, id);
  }
}
