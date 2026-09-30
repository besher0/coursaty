import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudentsService } from '../services/students.service';
import { CreateStudentDto } from '../dtos/create-student.dto';
import { CourseInterestsService } from '../services/course-interests.service';
import { SaveCourseInterestDto } from '../dtos/course-interest.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/roles.decorator';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly courseInterests: CourseInterestsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create student profile (legacy public endpoint)' })
  @ApiCreatedResponse({ description: 'Student created' })
  async create(@Body() dto: CreateStudentDto) {
    return this.students.create(dto);
  }

  @Post('me/course-interests/:courseId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save current student course payment interest' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  saveCourseInterest(
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
    @Body() body: SaveCourseInterestDto,
    @Req() req: any,
  ) {
    return this.courseInterests.saveInterest(req.user, courseId, body.source);
  }

  @Get('me/course-interests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List current student course payment interests' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  listCourseInterests(@Req() req: any) {
    return this.courseInterests.listInterests(req.user);
  }

  @Delete('me/course-interests/:courseId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete current student course payment interest' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  deleteCourseInterest(
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
    @Req() req: any,
  ) {
    return this.courseInterests.deleteInterest(req.user, courseId);
  }
}
