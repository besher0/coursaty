import { Controller, Get, UseGuards, Req, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { DashboardService } from '../services/dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('student-college-info')
  @ApiOperation({ summary: 'Get college advertisements, teachers, regular courses and program courses' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getStudentCollegeInfo(@Req() req: any, @Query('limit') limit: string = '7') {
    const parsedLimit = parseInt(limit);
    return this.dashboardService.getStudentCollegeInfo(
      req.user,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 7,
    );
  }

  @Get('courses-by-subjects')
  @ApiOperation({ summary: 'Get courses organized by college, year, and season' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getCoursesByCollege(@Req() req: any, @Query('collegeYearId') collegeYearId?: string) {
    return this.dashboardService.getCoursesByCollege(req.user, collegeYearId ? Number(collegeYearId) : undefined);
  }

  @Get('subjects/:id/courses')
  @ApiOperation({ summary: 'Get subject courses in student college with pagination' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getSubjectCourses(
    @Req() req: any,
    @Param('id') subjectId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);

    return this.dashboardService.getSubjectCourses(
      req.user,
      Number(subjectId),
      Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10,
    );
  }

  @Get('college-teachers')
  @ApiOperation({ summary: 'Get all teachers in the student college with likes and courses count' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getCollegeTeachers(@Req() req: any) {
    return this.dashboardService.getCollegeTeachers(req.user);
  }

  @Get('teachers/:id')
  @ApiOperation({ summary: 'Get teacher details with paginated courses' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getTeacherDetails(
    @Param('id') teacherId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.dashboardService.getTeacherDetails(teacherId, parseInt(page), parseInt(limit));
  }

  @Get('courses-by-category')
  @ApiOperation({ summary: 'Get courses grouped by category then year with pagination per year' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getCoursesByCategory(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.dashboardService.getCoursesByCategory(req.user, parseInt(page), parseInt(limit));
  }

  @Get('courses-by-popular')
  @ApiOperation({ summary: 'Get courses grouped by year ordered by most subscribed' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getCoursesByPopular(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.dashboardService.getCoursesByPopular(req.user, parseInt(page), parseInt(limit));
  }

  @Get('courses-by-year')
  @ApiOperation({ summary: 'Get courses grouped by year without category grouping' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getCoursesByYear(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.dashboardService.getCoursesByYear(req.user, parseInt(page), parseInt(limit));
  }

  @Get('courses')
  @ApiOperation({ summary: 'Unified courses endpoint: category/all/popular' })
  @ApiQuery({ name: 'filter', required: false, description: 'all | popular' })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category id' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getCoursesUnified(
    @Req() req: any,
    @Query('filter') filter: string = 'all',
    @Query('categoryId') categoryId?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.dashboardService.getCoursesUnified(
      req.user,
      filter,
      categoryId ? Number(categoryId) : undefined,
      parseInt(page),
      parseInt(limit),
    );
  }
}

