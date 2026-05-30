import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminsService } from '../services/admins.service';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { CreateAdminDto } from '../dtos/create-admin.dto';
import { AdminDashboardDto, AdminDashboardQueryDto } from '../dtos/admin-dashboard.dto';
import { DashboardCoursesQueryDto } from '../dtos/dashboard-courses-query.dto';
import { UsersDirectoryQueryDto } from '../dtos/users-directory-query.dto';
import { UpdateUserStatusDto } from '../dtos/update-user-status.dto';
import { UpdateUserPasswordDto } from '../dtos/update-user-password.dto';
import { ManageSubjectTeacherDto } from '../dtos/manage-subject-teacher.dto';
import { ResetStudentPasswordDto } from '../dtos/reset-student-password.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/roles.decorator';

@ApiTags('admins')
@Controller('admins')
export class AdminsController {
  constructor(
    private readonly admins: AdminsService,
    private readonly dashboardService: AdminDashboardService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create admin profile (public)' })
  @ApiCreatedResponse({ description: 'Admin created' })
  async create(@Body() dto: CreateAdminDto) {
    return this.admins.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List admins' })
  @ApiOkResponse({ description: 'Admins list' })
  async list() {
    return this.admins.list();
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current admin profile' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getProfile(@Req() req: any) {
    return this.admins.getAdminProfile(req.user.userId);
  }

  @Get('dashboard')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get admin dashboard with metrics, codes, and pending items',
  })
  @ApiQuery({ name: 'universityId', required: false, description: 'Filter dashboard by university id' })
  @ApiOkResponse({
    type: AdminDashboardDto,
    description: 'Admin dashboard data',
  })
  async getDashboard(@Query() query: AdminDashboardQueryDto) {
    return this.dashboardService.getDashboard(query);
  }

  @Get('universities/:universityId/pending-courses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get pending courses by university id' })
  async getPendingCoursesByUniversityId(
    @Param('universityId', new ParseUUIDPipe({ version: '4' })) universityId: string,
  ) {
    return this.dashboardService.getPendingCoursesByUniversityId(universityId);
  }

  @Get('universities/:universityId/pending-teachers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get pending teachers by university id' })
  async getPendingTeachersByUniversityId(
    @Param('universityId', new ParseUUIDPipe({ version: '4' })) universityId: string,
  ) {
    return this.dashboardService.getPendingTeachersByUniversityId(universityId);
  }

  @Get('universities/:universityId/pending-notifications')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get pending notifications by university id' })
  async getPendingNotificationsByUniversityId(
    @Param('universityId', new ParseUUIDPipe({ version: '4' })) universityId: string,
  ) {
    return this.dashboardService.getPendingNotificationsByUniversityId(universityId);
  }

  @Get('dashboard/courses/subjects')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get subject courses for admin (with optional subject/university filters)',
  })
  @ApiOkResponse({ description: 'Subject courses' })
  async getDashboardSubjectCourses(@Query() query: DashboardCoursesQueryDto) {
    return this.admins.getDashboardSubjectCourses(
      query.subjectId,
      query.universityId,
    );
  }

  @Get('dashboard/courses/programs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get program courses for admin (with optional program/university filters)',
  })
  @ApiOkResponse({ description: 'Program courses' })
  async getDashboardProgramCourses(@Query() query: DashboardCoursesQueryDto) {
    return this.admins.getDashboardProgramCourses(
      query.programId,
      query.universityId,
    );
  }

  @Get('code-statistics')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get detailed code statistics' })
  @ApiOkResponse({ description: 'Code statistics data' })
  async getCodeStatistics() {
    return this.dashboardService.getDetailedCodeStatistics();
  }

  @Get('search/subjects')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Search subjects by name and return subject, college, and department',
  })
  @ApiQuery({ name: 'name', required: false, description: 'Subject name search text' })
  @ApiOkResponse({ description: 'Subjects search results' })
  async searchSubjects(@Query('name') name?: string) {
    return this.admins.searchSubjects(name);
  }

  @Get('search/programs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Search programs by name and return program, college, and department',
  })
  @ApiQuery({ name: 'name', required: false, description: 'Program name search text' })
  @ApiOkResponse({ description: 'Programs search results' })
  async searchPrograms(@Query('name') name?: string) {
    return this.admins.searchPrograms(name);
  }
  @Get('search/students')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Search students by university number, name, or phone number',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search query (university number, name, or phone)' })
  @ApiOkResponse({ description: 'Students search results' })
  async searchStudents(@Query('q') query?: string) {
    return this.admins.searchStudents(query);
  }
  @Get('getSubjectsByCollageId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get subjects by college id' })
  @ApiQuery({ name: 'collegeId', required: true, description: 'College UUID' })
  async getSubjectsByCollageId(
    @Query('collegeId', new ParseUUIDPipe({ version: '4' })) collegeId: string,
  ) {
    return this.admins.getSubjectsByCollegeId(collegeId);
  }

  @Get('getSubjectsByDeptarmentId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get subjects by department id' })
  @ApiQuery({ name: 'departmentId', required: true, description: 'Department UUID' })
  async getSubjectsByDeptarmentId(
    @Query('departmentId', new ParseUUIDPipe({ version: '4' })) departmentId: string,
  ) {
    return this.admins.getSubjectsByDepartmentId(departmentId);
  }

  @Get('getProgramsByCollageId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get programs by college id' })
  @ApiQuery({ name: 'collegeId', required: true, description: 'College UUID' })
  async getProgramsByCollageId(
    @Query('collegeId', new ParseUUIDPipe({ version: '4' })) collegeId: string,
  ) {
    return this.admins.getProgramsByCollegeId(collegeId);
  }

  @Get('subjects/:subjectId/teachers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get teachers assigned to a subject/program',
  })
  @ApiOkResponse({ description: 'Assigned teachers list' })
  async getSubjectTeachers(
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
  ) {
    return this.admins.getSubjectTeachers(subjectId);
  }

  @Get('subjects/:subjectId/available-teachers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get available teachers for subject/program (by college/department) ' })
  async getAvailableTeachersForSubject(
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
  ) {
    return this.admins.getAvailableTeachersForSubject(subjectId);
  }

  @Get('subjects/:subjectId/courses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get courses of a subject' })
  async getCoursesOfSubject(
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
  ) {
    return this.admins.getCoursesOfSubject(subjectId);
  }

  @Post('subjects/:subjectId/teachers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Assign teacher to a subject/program',
  })
  @ApiCreatedResponse({ description: 'Teacher assigned to subject/program' })
  async assignTeacherToSubject(
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
    @Body() body: ManageSubjectTeacherDto,
  ) {
    return this.admins.assignTeacherToSubject(subjectId, body.teacherId);
  }

  @Delete('subjects/:subjectId/teachers/:teacherId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Remove teacher from a subject/program',
  })
  @ApiOkResponse({ description: 'Teacher removed from subject/program' })
  async removeTeacherFromSubject(
    @Param('subjectId', new ParseUUIDPipe({ version: '4' })) subjectId: string,
    @Param('teacherId', new ParseUUIDPipe({ version: '4' })) teacherId: string,
  ) {
    return this.admins.removeTeacherFromSubject(subjectId, teacherId);
  }

  @Get('teachers/:teacherId/allowed-subjects')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get allowed subjects/programs for a teacher',
  })
  @ApiOkResponse({ description: 'Teacher allowed subjects/programs' })
  async getTeacherAllowedSubjects(
    @Param('teacherId', new ParseUUIDPipe({ version: '4' })) teacherId: string,
  ) {
    return this.admins.getTeacherAllowedSubjects(teacherId);
  }

  @Get('getTeachersByCollageID')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get teachers by college id' })
  @ApiQuery({ name: 'collegeId', required: true, description: 'College UUID' })
  async getTeachersByCollageID(
    @Query('collegeId', new ParseUUIDPipe({ version: '4' })) collegeId: string,
  ) {
    return this.admins.getTeachersByCollegeId(collegeId);
  }

  @Get('getTeachersByDeptaramentId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get teachers by department id' })
  @ApiQuery({ name: 'departmentId', required: true, description: 'Department UUID' })
  async getTeachersByDeptaramentId(
    @Query('departmentId', new ParseUUIDPipe({ version: '4' })) departmentId: string,
  ) {
    return this.admins.getTeachersByDepartmentId(departmentId);
  }

  @Get('universities/:universityId/teachers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get teachers by university id' })
  async getTeachersByUniversityId(
    @Param('universityId', new ParseUUIDPipe({ version: '4' })) universityId: string,
  ) {
    return this.admins.getTeachersByUniversityId(universityId);
  }

  @Get('universities/:universityId/students')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get students by university id' })
  async getStudentsByUniversityId(
    @Param('universityId', new ParseUUIDPipe({ version: '4' })) universityId: string,
  ) {
    return this.admins.getStudentsByUniversityId(universityId);
  }

  @Get('students/:studentId/profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Get detailed student profile with college, department, and subscribed courses grouped by active/inactive',
  })
  @ApiOkResponse({ description: 'Student profile details' })
  async getStudentProfile(
    @Param('studentId') studentId: string,
  ) {
    return this.admins.getStudentProfile(studentId);
  }

  @Post('students/:studentId/reset-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Reset student password and return the new plain password',
  })
  @ApiOkResponse({ description: 'Student password reset successfully' })
  async resetStudentPassword(
    @Param('studentId') studentId: string,
    @Body() body: ResetStudentPasswordDto,
  ) {
    return this.admins.resetStudentPassword(studentId, body?.password);
  }

  @Get('teachers/:teacherId/profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Get detailed teacher profile with active/finished courses and interactive students count',
  })
  @ApiOkResponse({ description: 'Teacher profile details' })
  async getTeacherProfile(
    @Param('teacherId', new ParseUUIDPipe({ version: '4' })) teacherId: string,
  ) {
    return this.admins.getTeacherProfile(teacherId);
  }

  @Get('departments/:departmentId/subjects')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get subjects by department id (REST path)' })
  async getDepartmentSubjects(
    @Param('departmentId', new ParseUUIDPipe({ version: '4' })) departmentId: string,
  ) {
    return this.admins.getSubjectsByDepartmentId(departmentId);
  }

  @Get('departments/:departmentId/teachers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get teachers by department id (REST path)' })
  async getDepartmentTeachers(
    @Param('departmentId', new ParseUUIDPipe({ version: '4' })) departmentId: string,
  ) {
    return this.admins.getTeachersByDepartmentId(departmentId);
  }

  @Get('programs/:programId/available-teachers')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get available teachers for a program (by college/department)' })
  async getAvailableTeachersForProgram(
    @Param('programId', new ParseUUIDPipe({ version: '4' })) programId: string,
  ) {
    return this.admins.getAvailableTeachersForSubject(programId);
  }

  @Get('programs/:programId/courses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get courses of a program' })
  async getCoursesOfProgram(
    @Param('programId', new ParseUUIDPipe({ version: '4' })) programId: string,
  ) {
    return this.admins.getCoursesOfProgram(programId);
  }

  @Get('teachers/:teacherId/courses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get courses created by a teacher' })
  async getCoursesOfTeacher(
    @Param('teacherId', new ParseUUIDPipe({ version: '4' })) teacherId: string,
  ) {
    return this.admins.getCoursesOfTeacher(teacherId);
  }

  @Get('students/:studentId/courses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get courses subscribed by a student' })
  async getCoursesOfStudent(
    @Param('studentId', new ParseUUIDPipe({ version: '4' })) studentId: string,
  ) {
    return this.admins.getCoursesOfStudent(studentId);
  }

  @Get('colleges/:collegeId/programs')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get programs by college id (REST path)' })
  async getCollegePrograms(
    @Param('collegeId', new ParseUUIDPipe({ version: '4' })) collegeId: string,
  ) {
    return this.admins.getProgramsByCollegeId(collegeId);
  }

  @Get('getYearsOfCollage')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get years of college' })
  @ApiQuery({ name: 'collegeId', required: true, description: 'College UUID' })
  async getYearsOfCollage(
    @Query('collegeId', new ParseUUIDPipe({ version: '4' })) collegeId: string,
  ) {
    return this.admins.getYearsOfCollege(collegeId);
  }

  @Get('search/courses')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Search courses by name and classify into active, expired, deleted, and pending with subject/program filter',
  })
  @ApiQuery({ name: 'name', required: false, description: 'Course name search text' })
  @ApiQuery({
    name: 'relatedTo',
    required: false,
    enum: ['subject', 'program'],
    description: 'Filter courses by relation type: subject or program',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'expired', 'deleted', 'pending'],
    description: 'Select the tab/status you want to list',
  })
  @ApiOkResponse({ description: 'Classified courses search results' })
  async searchCourses(
    @Query('name') name?: string,
    @Query('relatedTo') relatedTo?: 'subject' | 'program',
    @Query('status') status?: 'active' | 'expired' | 'deleted' | 'pending',
  ) {
    return this.admins.searchCourses(
      name,
      relatedTo,
      status ?? 'active',
    );
  }

  @Get('revenue')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get revenue statistics with university/college/year/month filters' })
  @ApiQuery({ name: 'universityId', required: false, description: 'Filter by university (UUID)' })
  @ApiQuery({ name: 'collegeId', required: false, description: 'Filter by college (UUID)' })
  @ApiQuery({ name: 'year', required: false, description: 'Filter by year (e.g. 2026)' })
  @ApiQuery({ name: 'month', required: false, description: 'Filter by month (1-12)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Filter start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Filter end date (YYYY-MM-DD)' })
  @ApiOkResponse({ description: 'Revenue statistics' })
  async getRevenue(
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.admins.getRevenue(
      universityId,
      collegeId,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
      dateFrom,
      dateTo,
    );
  }

  @Get('users-directory')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List teachers or students with search' })
  @ApiOkResponse({ description: 'Users directory results' })
  async getUsersDirectory(@Query() query: UsersDirectoryQueryDto) {
    return this.admins.getUsersDirectory(query);
  }

  @Patch('users/:userId/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update user status (active, pending, inactive, suspended)' })
  @ApiOkResponse({ description: 'User status updated' })
  async updateUserStatus(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.admins.updateUserStatus(userId, dto.status);
  }

  @Patch('users/:userId/password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update any user password by user id (admin only)' })
  @ApiOkResponse({ description: 'User password updated' })
  async updateUserPassword(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: UpdateUserPasswordDto,
  ) {
    return this.admins.updateUserPassword(userId, dto.password);
  }
}
