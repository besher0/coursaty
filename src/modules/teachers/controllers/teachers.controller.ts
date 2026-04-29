import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TeachersService } from '../services/teachers.service';
import { CreateTeacherDto } from '../dtos/create-teacher.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { TeacherSummaryDto } from '../dtos/teacher-summary.dto';
import { TeacherSubjectPermissionsDto } from '../dtos/teacher-subject-permissions.dto';
import { TeacherAffiliationDto } from '../dtos/teacher-affiliation.dto';
import { RecordTeacherWithdrawalDto } from '../dtos/record-teacher-withdrawal.dto';

@ApiTags('teachers')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Post()
  @ApiOperation({ summary: 'Create teacher profile (public)' })
  @ApiCreatedResponse({ description: 'Teacher created' })
  async create(@Body() dto: CreateTeacherDto) {
    return this.teachers.create(dto);
  }

  @Get('me/summary')
  @ApiOperation({ summary: 'Get teacher summary (teacher only)' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: TeacherSummaryDto })
  @ApiQuery({ name: 'coursesPage', required: false })
  @ApiQuery({ name: 'coursesLimit', required: false })
  @ApiQuery({ name: 'pendingPage', required: false })
  @ApiQuery({ name: 'pendingLimit', required: false })
  @Header('Cache-Control', 'private, max-age=60')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  getMySummary(
    @Req() req: any,
    @Query('coursesPage') coursesPage?: string,
    @Query('coursesLimit') coursesLimit?: string,
    @Query('pendingPage') pendingPage?: string,
    @Query('pendingLimit') pendingLimit?: string,
  ) {
    return this.teachers.getTeacherSummary(req.user, {
      coursesPage: coursesPage ? Number(coursesPage) : undefined,
      coursesLimit: coursesLimit ? Number(coursesLimit) : undefined,
      pendingPage: pendingPage ? Number(pendingPage) : undefined,
      pendingLimit: pendingLimit ? Number(pendingLimit) : undefined,
    });
  }

  @Get('me/courses/active')
  @ApiOperation({ summary: 'List active teacher courses grouped by university and year' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  listActiveCourses(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.teachers.listTeacherCoursesByExpiry(req.user, false, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('me/courses/expired')
  @ApiOperation({ summary: 'List expired teacher courses grouped by university and year' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  listExpiredCourses(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.teachers.listTeacherCoursesByExpiry(req.user, true, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('me/affiliations')
  @ApiOperation({ summary: 'List teacher affiliations (teacher only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  listMyAffiliations(@Req() req: any) {
    return this.teachers.listMyAffiliations(req.user);
  }

  @Post('me/affiliations')
  @ApiOperation({ summary: 'Add teacher affiliation (teacher only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  addMyAffiliation(@Req() req: any, @Body() body: TeacherAffiliationDto) {
    return this.teachers.addMyAffiliation(req.user, body.universityId, body.collegeId, body.departmentId);
  }

  @Post('me/affiliations/remove')
  @ApiOperation({ summary: 'Remove teacher affiliation (teacher only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  removeMyAffiliation(@Req() req: any, @Body() body: TeacherAffiliationDto) {
    return this.teachers.removeMyAffiliation(req.user, body.universityId, body.collegeId, body.departmentId);
  }

  @Get('me/allowed-subjects')
  @ApiOperation({ summary: 'List allowed subjects for the current teacher' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  listMyAllowedSubjects(@Req() req: any) {
    return this.teachers.listMyAllowedSubjects(req.user);
  }

  @Get('me/revenue')
  @ApiOperation({ summary: 'Get teacher revenues for all courses (teacher only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  getMyRevenue(@Req() req: any) {
    return this.teachers.getMyCoursesRevenue(req.user);
  }

  @Get('me/withdrawals')
  @ApiOperation({ summary: 'Get teacher withdrawals (teacher only)' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER')
  getMyWithdrawals(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.teachers.getMyWithdrawals(req.user, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id/revenue')
  @ApiOperation({ summary: 'Get teacher revenues for all courses (admin only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getTeacherRevenue(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.teachers.getTeacherCoursesRevenue(id);
  }

  @Get(':id/withdrawals')
  @ApiOperation({ summary: 'Get teacher withdrawals (admin only)' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getTeacherWithdrawals(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.teachers.getTeacherWithdrawals(id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(':id/withdrawals')
  @ApiOperation({ summary: 'Record teacher withdrawal (admin only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  recordTeacherWithdrawal(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: RecordTeacherWithdrawalDto,
    @Req() req: any,
  ) {
    return this.teachers.recordTeacherWithdrawal(id, body.amount, req.user, body.withdrawnAt);
  }

  @Get(':id/allowed-subjects')
  @ApiOperation({ summary: 'List allowed subjects for a teacher (admin only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listAllowedSubjects(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.teachers.listAllowedSubjects(id);
  }

  @Post(':id/allowed-subjects')
  @ApiOperation({ summary: 'Allow subjects/programs for a teacher (admin only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  addAllowedSubjects(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: TeacherSubjectPermissionsDto,
  ) {
    return this.teachers.addAllowedSubjects(id, body.subjectIds);
  }

  @Post(':id/allowed-subjects/remove')
  @ApiOperation({ summary: 'Remove allowed subjects/programs from a teacher (admin only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removeAllowedSubjects(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: TeacherSubjectPermissionsDto,
  ) {
    return this.teachers.removeAllowedSubjects(id, body.subjectIds);
  }
}
