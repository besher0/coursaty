import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { UpdateFcmDto } from '../dtos/update-fcm.dto';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { UpdateUserProfileDto } from '../dtos/update-user-profile.dto';
import { UpdateStudentProfileDto } from '../dtos/update-student-profile.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch(':id/fcm-token')
  @ApiOperation({ summary: 'Update user FCM token' })
  @ApiOkResponse({ description: 'FCM token updated' })
  async updateFcm(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateFcmDto,
  ) {
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
  @ApiOperation({ summary: 'Update student info (name, universityId, collegeId, departmentId, collegeYearId)' })
  @UseGuards(JwtAuthGuard)
  async updateStudentProfile(@Req() req: any, @Body() dto: UpdateStudentProfileDto) {
    return this.users.updateStudentProfile(req.user.userId, dto);
  }
}


