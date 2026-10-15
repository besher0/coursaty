import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { UpdateFcmDto } from '../dtos/update-fcm.dto';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { UpdateUserProfileDto } from '../dtos/update-user-profile.dto';
import { UpdateStudentProfileDto } from '../dtos/update-student-profile.dto';
import { ChangePasswordDto } from '../dtos/change-password.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch(':id/fcm-token')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user FCM token (own account, or any as admin)' })
  @ApiOkResponse({ description: 'FCM token updated' })
  @UseGuards(JwtAuthGuard)
  async updateFcm(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateFcmDto,
    @Req() req: any,
  ) {
    // Was open to anyone: changing another user's token redirects their
    // notifications to the caller's device.
    if (req.user?.type !== 'ADMIN' && String(req.user?.userId) !== id) {
      throw new ForbiddenException('لا يمكن تعديل حساب مستخدم آخر');
    }
    return this.users.updateFcmToken(id, body.fcmToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile with student/teacher data' })
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: any) {
    return this.users.getProfile(req.user.userId);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile (gender, fcmToken, student name/universityNumber)' })
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(req.user.userId, dto);
  }

  @Patch('me/user')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user account info (phone, gender)' })
  @UseGuards(JwtAuthGuard)
  async updateUserProfile(@Req() req: any, @Body() dto: UpdateUserProfileDto) {
    return this.users.updateUserProfile(req.user.userId, dto);
  }

  @Patch('me/student')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update student info (name, universityId, collegeId, departmentId, collegeYearId, universityNumber)' })
  @UseGuards(JwtAuthGuard)
  async updateStudentProfile(@Req() req: any, @Body() dto: UpdateStudentProfileDto) {
    return this.users.updateStudentProfile(req.user.userId, dto);
  }

  @Patch('me/change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current user password' })
  @UseGuards(JwtAuthGuard)
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(req.user.userId, dto);
  }

  @Delete('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete current account while preserving related records' })
  @UseGuards(JwtAuthGuard)
  async deleteMyAccount(@Req() req: any) {
    return this.users.updateUserStatus(String(req.user.userId), 'deleted');
  }
}


