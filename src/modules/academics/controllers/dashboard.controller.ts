import { Controller, Get, Req, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import { DashboardService } from '../services/dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private buildGuestFilter(query: { deviceId?: string }) {
    return {
      deviceId: query.deviceId,
    };
  }

  @Get('student-college-info')
  @ApiOperation({ summary: 'Get college advertisements, teachers, subjects, and programs for the student college/department' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items limit, default is 7' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getStudentCollegeInfo(
    @Req() req: any,
    @Query('limit') limit: string = '7',
    @Query('deviceId') deviceId?: string,
  ) {
    const parsedLimit = parseInt(limit);
    return this.dashboardService.getStudentCollegeInfo(
      req.user,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 7,
      this.buildGuestFilter({ deviceId }),
    );
  }

  @Get('courses-by-subjects')
  @ApiOperation({ summary: 'Get courses organized by college, year, and season' })
  @ApiQuery({ name: 'collegeYearId', required: false, description: 'Optional college year id' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getCoursesByCollege(
    @Req() req: any,
    @Query('collegeYearId') collegeYearId?: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.dashboardService.getCoursesByCollege(
      req.user,
      collegeYearId,
      this.buildGuestFilter({ deviceId }),
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
  @ApiOperation({ summary: 'Get program courses in student college with pagination' })
  @ApiQuery({ name: 'id', required: false, description: 'Optional program id to filter courses' })
  @ApiQuery({ name: 'page', required: false, description: 'Optional page number, default is 1' })
  @ApiQuery({ name: 'limit', required: false, description: 'Optional items per page, default is 10' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Optional guest device id' })
  getProgramCourses(
    @Req() req: any,
    @Query('id') programId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
  ) {
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    return this.dashboardService.getProgramCourses(
      req.user,
      programId,
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
      this.buildGuestFilter({ deviceId }),
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
  @ApiOperation({ summary: 'Unified courses endpoint: category/all/popular' })
  @ApiQuery({ name: 'filter', required: false, description: 'all | popular' })
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

