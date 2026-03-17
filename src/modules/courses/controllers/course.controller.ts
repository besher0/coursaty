import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CourseService } from '../services/course.service';
import { CreateCourseDto } from '../dtos/create-course.dto';
import { UpdateCourseDto } from '../dtos/update-course.dto';
import { ApproveCourseDto } from '../dtos/approve-course.dto';
import { CreateCourseCategoryDto } from '../dtos/create-course-category.dto';
import { UpdateCourseCategoryDto } from '../dtos/update-course-category.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post()
  @ApiOperation({ summary: 'Create a course' })
  @ApiOkResponse({ description: 'Course created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  async createCourse(@Body() dto: CreateCourseDto, @Req() req: any) {
    return this.courseService.createCourse(dto, req.user);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List course categories' })
  @ApiOkResponse({ description: 'Course categories' })
  listCourseCategories() {
    return this.courseService.getCourseCategories();
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create course category' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createCourseCategory(@Body() dto: CreateCourseCategoryDto) {
    return this.courseService.createCourseCategory(dto.name, dto.isProgram);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Update course category' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateCourseCategory(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateCourseCategoryDto) {
    return this.courseService.updateCourseCategory(id, dto.name, dto.isProgram);
  }

  @Delete('categories/:id')
  @ApiOperation({ summary: 'Delete course category' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  deleteCourseCategory(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.courseService.deleteCourseCategory(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get course with aggregated counts' })
  @UseGuards(JwtAuthGuard)
  async getCourse(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.courseService.getCourseWithCounts(id, req.user);
  }

  @Get(':id/details')
  @ApiOperation({ summary: 'Get course details and lectures' })
  @UseGuards(JwtAuthGuard)
  async getCourseDetails(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.courseService.getCourseDetails(id, req.user);
  }

  @Get(':id/admin-details')
  @ApiOperation({ summary: 'Get full course details for admin (course, details, lectures, codes)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getAdminCourseDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseService.getAdminCourseDetails(id);
  }

  @Get()
  @ApiOperation({ summary: 'List courses with counts' })
  async listCourses() {
    return this.courseService.listCourses();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update course' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateCourse(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateCourseDto, @Req() req: any) {
    return this.courseService.updateCourse(id, dto, req.user);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve course and set teacher percentage' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  approveCourse(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: ApproveCourseDto, @Req() req: any) {
    return this.courseService.approveCourse(id, dto.teacherPercentage, req.user);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject course' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  rejectCourse(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.courseService.rejectCourse(id, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete course' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removeCourse(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.courseService.deleteCourse(id, req.user);
  }

  @Post(':courseId/lectures/:lectureId/videos')
  @ApiOperation({ summary: 'Upload video to Bunny.net and attach to lecture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  async uploadLectureVideo(
    @Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    return this.courseService.uploadLectureVideo(lectureId, file, req.user);
  }
}
