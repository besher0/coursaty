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
import { UploadVideoDto } from '../../lectures/dtos/upload-video.dto';
import { InitTusVideoUploadDto } from '../../lectures/dtos/init-tus-video-upload.dto';
import { CompleteTusVideoUploadDto } from '../../lectures/dtos/complete-tus-video-upload.dto';
import { RefreshTusVideoUploadDto } from '../../lectures/dtos/refresh-tus-video-upload.dto';
import { BUNNY_STREAM_RESOLUTIONS } from '@/shared/bunny/bunny-resolution.constants';

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
  async getCourse(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.courseService.getCourseWithCounts(id, req.user);
  }

  @Get(':id/details')
  @ApiOperation({ summary: 'Get course details and lectures' })
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

  @Get(':id/admin-details/info')
  @ApiOperation({ summary: 'Get admin course details section only' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getAdminCourseInfo(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseService.getAdminCourseInfo(id);
  }

  @Get(':id/admin-details/lectures')
  @ApiOperation({ summary: 'Get admin course lectures section only' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getAdminCourseLectures(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseService.getAdminCourseLectures(id);
  }

  @Get(':id/admin-details/codes')
  @ApiOperation({ summary: 'Get admin course codes section only' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getAdminCourseCodes(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseService.getAdminCourseCodes(id);
  }

  @Get(':id/admin-details/revenue')
  @ApiOperation({ summary: 'Get admin course revenues section only' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getAdminCourseRevenue(@Param('id', ParseUUIDPipe) id: string) {
    return this.courseService.getAdminCourseRevenue(id);
  }

  @Get(':id/statistics')
  @ApiOperation({ summary: 'Get course statistics for admin or course owner teacher' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  async getCourseStatistics(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.courseService.getCourseStatistics(id, req.user);
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
        videoName: { type: 'string' },
        description: { type: 'string' },
        isFree: { type: 'boolean' },
        sortOrder: { type: 'number' },
        preferredResolution: { type: 'string', enum: [...BUNNY_STREAM_RESOLUTIONS] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  async uploadLectureVideo(
    @Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string,
    @UploadedFile() file: any,
    @Body() body: UploadVideoDto,
    @Req() req: any,
  ) {
    return this.courseService.uploadLectureVideo(lectureId, file, req.user, body);
  }

  @Post(':courseId/lectures/:lectureId/videos/tus/init')
  @ApiOperation({ summary: 'Initialize Bunny TUS resumable upload for lecture video' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  async initLectureVideoTusUpload(
    @Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string,
    @Body() body: InitTusVideoUploadDto,
    @Req() req: any,
  ) {
    return this.courseService.initTusLectureVideoUpload(lectureId, req.user, body);
  }

  @Post(':courseId/lectures/:lectureId/videos/tus/complete')
  @ApiOperation({ summary: 'Finalize Bunny TUS upload and create lecture video record' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  async completeLectureVideoTusUpload(
    @Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string,
    @Body() body: CompleteTusVideoUploadDto,
    @Req() req: any,
  ) {
    return this.courseService.completeTusLectureVideoUpload(lectureId, req.user, body);
  }

  @Post(':courseId/lectures/:lectureId/videos/tus/refresh')
  @ApiOperation({ summary: 'Refresh Bunny TUS signature for an existing lecture videoId' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  async refreshLectureVideoTusUpload(
    @Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string,
    @Body() body: RefreshTusVideoUploadDto,
    @Req() req: any,
  ) {
    return this.courseService.refreshTusLectureVideoUpload(lectureId, req.user, body);
  }
}
