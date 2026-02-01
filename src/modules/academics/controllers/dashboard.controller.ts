import { Controller, Get, UseGuards, Req, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
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
  getStudentCollegeInfo(@Req() req: any) {
    return this.dashboardService.getStudentCollegeInfo(req.user);
  }

  @Get('courses-by-college')
  @ApiOperation({ summary: 'Get courses organized by college, year, and season' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getCoursesByCollege(@Req() req: any) {
    return this.dashboardService.getCoursesByCollege(req.user);
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
}

