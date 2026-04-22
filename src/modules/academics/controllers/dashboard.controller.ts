import { Controller, Get, Req, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery, ApiOkResponse } from '@nestjs/swagger';
import { DashboardService } from '../services/dashboard.service';

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
  }) {
    return {
      deviceId: query.deviceId,
      universityId: query.universityId,
      collegeId: query.collegeId,
      departmentId: query.departmentId,
    };
  }

  @Get('student-college-info')
  @ApiOperation({ summary: 'Get college advertisements, teachers, subjects, and programs for the student college/department' })
  getStudentCollegeInfo(
    @Req() req: any,
    @Query('limit') limit: string = '7',
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const parsedLimit = parseInt(limit);
    return this.dashboardService.getStudentCollegeInfo(
      req.user,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 7,
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
    );
  }

  @Get('courses-by-subjects')
  @ApiOperation({ summary: 'Get courses organized by college, year, and season' })
  getCoursesByCollege(
    @Req() req: any,
    @Query('collegeYearId') collegeYearId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getCoursesByCollege(
      req.user,
      collegeYearId,
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
    );
  }

  @Get('subjects/:id/courses')
  @ApiOperation({ summary: 'Get subject courses in student college with pagination' })
  getSubjectCourses(
    @Req() req: any,
    @Param('id') subjectId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    return this.dashboardService.getSubjectCourses(
      req.user,
      subjectId,
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
    );
  }

  @Get('programs/courses')
  @ApiOperation({ summary: 'Get program courses in student college with pagination' })
  @ApiQuery({ name: 'id', required: false, description: 'Optional program id to filter courses' })
  getProgramCourses(
    @Req() req: any,
    @Query('id') programId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    return this.dashboardService.getProgramCourses(
      req.user,
      programId,
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
    );
  }

  @Get('college-teachers')
  @ApiOperation({ summary: 'Get all teachers in the student college with likes and courses count' })
  getCollegeTeachers(
    @Req() req: any,
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getCollegeTeachers(
      req.user,
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
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
  getCoursesByCategory(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getCoursesByCategory(
      req.user,
      parseInt(page),
      parseInt(limit),
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
    );
  }

  @Get('courses-by-popular')
  @ApiOperation({ summary: 'Get courses grouped by year ordered by most subscribed' })
  getCoursesByPopular(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getCoursesByPopular(
      req.user,
      parseInt(page),
      parseInt(limit),
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
    );
  }

  @Get('courses-by-year')
  @ApiOperation({ summary: 'Get courses grouped by year without category grouping' })
  getCoursesByYear(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getCoursesByYear(
      req.user,
      parseInt(page),
      parseInt(limit),
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
    );
  }

  @Get('courses')
  @ApiOperation({ summary: 'Unified courses endpoint: category/all/popular' })
  @ApiQuery({ name: 'filter', required: false, description: 'all | popular' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category id' })
  getCoursesUnified(
    @Req() req: any,
    @Query('filter') filter: string = 'all',
    @Query('categoryId') categoryId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getCoursesUnified(
      req.user,
      filter,
      categoryId,
      parseInt(page),
      parseInt(limit),
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
    );
  }

  @Get('programs')
@ApiOperation({ summary: 'Get only programs (isProgram=true) for the student\'s college' })
  @ApiOkResponse({ description: 'List of programs' })
  getStudentPrograms(
    @Req() req: any,
    @Query('deviceId') deviceId?: string,
    @Query('universityId') universityId?: string,
    @Query('collegeId') collegeId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.dashboardService.getStudentPrograms(
      req.user,
      this.buildGuestFilter({ deviceId, universityId, collegeId, departmentId }),
    );
  }
}

