import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from '../services/notifications.service';
import { CreateNotificationDto } from '../dtos/create-notification.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create notification (teacher/admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  create(@Body() dto: CreateNotificationDto, @Req() req: any) {
    return this.notifications.createNotification(dto, req.user);
  }

  @Get('my')
  @ApiOperation({ summary: 'List my notifications (teacher/admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  listMy(@Req() req: any) {
    return this.notifications.listMyNotifications(req.user);
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending notifications (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listPending() {
    return this.notifications.listPendingNotifications();
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve notification (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  approve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.notifications.approveNotification(id, req.user);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject notification (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  reject(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.notifications.rejectNotification(id, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'List approved notifications for student' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  listStudent(@Req() req: any) {
    return this.notifications.listStudentNotifications(req.user);
  }
}
