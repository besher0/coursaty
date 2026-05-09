import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from '../services/notifications.service';
import { CreateNotificationDto } from '../dtos/create-notification.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ListNotificationsQueryDto } from '../dtos/list-notifications-query.dto';

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
  @ApiOperation({ summary: 'Teacher: own notifications, Admin: all notifications' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  listMy(@Req() req: any, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.listMyNotifications(req.user, query.universityId, query.activeOnly);
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending notifications (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listPending(@Query() query: ListNotificationsQueryDto) {
    return this.notifications.listPendingNotifications(query.universityId);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve notification (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  approve(@Param('id') id: string, @Req() req: any) {
    return this.notifications.approveNotification(id, req.user);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject notification (admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  reject(@Param('id') id: string, @Req() req: any) {
    return this.notifications.rejectNotification(id, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get notification details by id' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN', 'STUDENT')
  notificationById(@Param('id') id: string, @Req() req: any) {
    return this.notifications.notificationById(id, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification permanently (teacher/admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.notifications.deleteNotification(id, req.user);
  }

  @Get()
  @ApiOperation({ summary: 'List approved notifications for student' })
  listStudent(@Req() req: any) {
    return this.notifications.listStudentNotifications(req.user);
  }
}
