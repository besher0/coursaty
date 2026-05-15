import { Controller, Get, Req, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import { DashboardService } from '../services/dashboard.service';
import { OptionalJwtAuthGuard } from '@/modules/auth/guards/optional-jwt-auth.guard';

@UseGuards(OptionalJwtAuthGuard)
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private buildGuestFilter(query: {
    deviceId?: string;
    universityId?: string;
    collegeId?: string;
    departmentId?: string;
    collegeYearId?: string;
  }) {
    return {
      deviceId: query.deviceId,
      universityId: query.universityId,
      collegeId: query.collegeId,
      departmentId: query.departmentId,
      collegeYearId: query.collegeYearId,
    };
  }

  @Get('student-college-info')
  @ApiOperation({ summary: 'Get college advertisements, teachers, and subjects/programs filtered by year and season' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items limit, default is 7' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  @ApiQuery({ name: 'collegeYearId', required: false, description: 'Optional college year id to filter subjects/programs' })
  @ApiQuery({ name: 'seasonId', required: false, description: 'Optional season id to filter subjects/programs' })
  getStudentCollegeInfo(
    @Req() req: any,
    @Query('limit') limit: string = '7',
    @Query('deviceId') deviceId?: string,
    @Query('collegeYearId') collegeYearId?: string,
    @Query('seasonId') seasonId?: string,
  ) {
    const parsedLimit = parseInt(limit);
    return this.dashboardService.getStudentCollegeInfo(
      req.user,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 7,
      this.buildGuestFilter({ deviceId, collegeYearId }),
      { collegeYearId, seasonId },
    );
  }

  @Get('search')
  @ApiOperation({ summary: 'Search subjects, programs, courses, and teachers for the student college' })
  @ApiQuery({ name: 'q', required: false, description: 'Search text' })
  @ApiQuery({ name: 'page', required: false, description: 'Optional page number, default is 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items per page, default is 10' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  @ApiOkResponse({ description: 'Search results' })
  searchCatalog(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
  ) {
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    return this.dashboardService.searchCatalog(
      req.user,
      q,
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
      this.buildGuestFilter({ deviceId }),
    );
  }

  @Get('courses-by-subjects')
  @ApiOperation({ summary: 'Get courses organized by college, year, and season' })
  @ApiQuery({ name: 'collegeYearId', required: false, description: 'Optional college year id' })
  @ApiQuery({ name: 'seasonId', required: false, description: 'Optional season id' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getCoursesByCollege(
    @Req() req: any,
    @Query('collegeYearId') collegeYearId?: string,
    @Query('seasonId') seasonId?: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.dashboardService.getCoursesByCollege(
      req.user,
      collegeYearId,
      seasonId,
      this.buildGuestFilter({ deviceId }),
    );
  }

  @Get('student/subjects')
  @ApiOperation({ summary: 'Get student college subjects with full details (filter by year and season)' })
  @ApiQuery({ name: 'collegeYearId', required: false, description: 'Optional college year id (defaults to student year)' })
  @ApiQuery({ name: 'seasonId', required: false, description: 'Optional season id (defaults to active home season)' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  @ApiQuery({ name: 'deviceID', required: false, description: 'Optional guest device id (alias for deviceId)' })
  getStudentSubjects(
    @Req() req: any,
    @Query('collegeYearId') collegeYearId?: string,
    @Query('seasonId') seasonId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('deviceID') deviceID?: string,
  ) {
    const resolvedDeviceId = deviceId ?? deviceID;
    return this.dashboardService.getStudentSubjects(
      req.user,
      { collegeYearId, seasonId },
      this.buildGuestFilter({ deviceId: resolvedDeviceId, collegeYearId }),
    );
  }

  @Get('student/programs')
  @ApiOperation({ summary: 'Get student college programs with full details' })
  @ApiQuery({ name: 'collegeYearId', required: false, description: 'Optional college year id (defaults to student year)' })
  @ApiQuery({ name: 'seasonId', required: false, description: 'Optional season id (defaults to active home season)' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  @ApiQuery({ name: 'deviceID', required: false, description: 'Optional guest device id (alias for deviceId)' })
  getStudentProgramsFull(
    @Req() req: any,
    @Query('collegeYearId') collegeYearId?: string,
    @Query('seasonId') seasonId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('deviceID') deviceID?: string,
  ) {
    const resolvedDeviceId = deviceId ?? deviceID;
    return this.dashboardService.getStudentProgramsFull(
      req.user,
      { collegeYearId, seasonId },
      this.buildGuestFilter({ deviceId: resolvedDeviceId, collegeYearId }),
    );
  }

  @Get('subjects/:id/courses')
  @ApiOperation({ summary: 'Get subject courses in student college with pagination' })
  @ApiQuery({ name: 'page', required: false, description: 'Optional page number, default is 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items per page, default is 10' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getSubjectCourses(
    @Req() req: any,
    @Param('id') subjectId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
  ) {
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    return this.dashboardService.getSubjectCourses(
      req.user,
      subjectId,
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
      this.buildGuestFilter({ deviceId }),
    );
  }

  @Get('programs/courses')
  @ApiOperation({ summary: 'Get all programs in student college, or courses for a selected program' })
  @ApiQuery({ name: 'id', required: false, description: 'Optional program id to filter courses' })
  @ApiQuery({ name: 'page', required: false, description: 'Optional page number, default is 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items per page, default is 10' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  @ApiQuery({ name: 'collegeYearId', required: false, description: 'Optional college year id to filter programs/courses' })
  @ApiQuery({ name: 'seasonId', required: false, description: 'Optional season id to filter programs/courses' })
  getProgramCourses(
    @Req() req: any,
    @Query('id') programId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
    @Query('collegeYearId') collegeYearId?: string,
    @Query('seasonId') seasonId?: string,
  ) {
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    return this.dashboardService.getProgramCourses(
      req.user,
      programId,
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
      this.buildGuestFilter({ deviceId, collegeYearId }),
      { collegeYearId, seasonId },
    );
  }

  @Get('courses/mixed')
  @ApiOperation({ summary: 'Get subject/program courses in one request' })
  @ApiQuery({ name: 'type', required: false, description: 'all | subject | program (default all)' })
  @ApiQuery({ name: 'subjectId', required: false, description: 'Optional subject id if type=subject' })
  @ApiQuery({ name: 'programId', required: false, description: 'Optional program id if type=program' })
  @ApiQuery({ name: 'page', required: false, description: 'Optional page number, default is 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items per page, default is 10' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  @ApiQuery({ name: 'universityId', required: false, description: 'Optional university id to filter courses by university' })
  getMixedCourses(
    @Req() req: any,
    @Query('type') type: 'all' | 'subject' | 'program' = 'all',
    @Query('subjectId') subjectId?: string,
    @Query('programId') programId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
  ) {
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    return this.dashboardService.getMixedCourses(
      req.user,
      type,
      subjectId,
      programId,
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
      this.buildGuestFilter({ deviceId, universityId }),
    );
  }

  @Get('college-teachers')
  @ApiOperation({ summary: 'Get all teachers in the student college with likes and courses count' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getCollegeTeachers(
    @Req() req: any,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.dashboardService.getCollegeTeachers(
      req.user,
      this.buildGuestFilter({ deviceId }),
    );
  }

  @Get('liked-teachers')
  @ApiOperation({ summary: 'Get teachers liked by current student' })
  getLikedTeachers(@Req() req: any) {
    return this.dashboardService.getLikedTeachers(req.user);
  }

  @Get('teachers/:id')
  @ApiOperation({ summary: 'Get teacher details with paginated courses' })
  getTeacherDetails(
    @Param('id') teacherId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.dashboardService.getTeacherDetails(teacherId, parseInt(page), parseInt(limit));
  }

  @Get('courses-by-category')
  @ApiOperation({ summary: 'Get courses grouped by category then year with pagination per year' })
  @ApiQuery({ name: 'page', required: false, description: 'Optional page number, default is 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items per page, default is 10' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getCoursesByCategory(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
  ) {
    return this.dashboardService.getCoursesByCategory(
      req.user,
      parseInt(page),
      parseInt(limit),
      this.buildGuestFilter({ deviceId }),
    );
  }

  @Get('courses-by-popular')
  @ApiOperation({ summary: 'Get courses grouped by year ordered by most subscribed' })
  @ApiQuery({ name: 'page', required: false, description: 'Optional page number, default is 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items per page, default is 10' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getCoursesByPopular(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
  ) {
    return this.dashboardService.getCoursesByPopular(
      req.user,
      parseInt(page),
      parseInt(limit),
      this.buildGuestFilter({ deviceId }),
    );
  }

  @Get('courses-by-year')
  @ApiOperation({ summary: 'Get courses grouped by year without category grouping' })
  @ApiQuery({ name: 'page', required: false, description: 'Optional page number, default is 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items per page, default is 10' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getCoursesByYear(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
  ) {
    return this.dashboardService.getCoursesByYear(
      req.user,
      parseInt(page),
      parseInt(limit),
      this.buildGuestFilter({ deviceId }),
    );
  }

  @Get('courses')
  @ApiOperation({ summary: 'Unified courses endpoint: category/all/popular/free' })
  @ApiQuery({ name: 'filter', required: false, description: 'all | popular | free' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category id' })
  @ApiQuery({ name: 'page', required: false, description: 'Optional page number, default is 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items per page, default is 10' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getCoursesUnified(
    @Req() req: any,
    @Query('filter') filter: string = 'all',
    @Query('categoryId') categoryId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
  ) {
    return this.dashboardService.getCoursesUnified(
      req.user,
      filter,
      categoryId,
      parseInt(page),
      parseInt(limit),
      this.buildGuestFilter({ deviceId }),
    );
  }

  @Get('programs')
  @ApiOperation({ summary: 'Get only programs (isProgram=true) for the student\'s college' })
  @ApiOkResponse({ description: 'List of programs' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getStudentPrograms(
    @Req() req: any,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.dashboardService.getStudentPrograms(
      req.user,
      this.buildGuestFilter({ deviceId }),
    );
  }
}
