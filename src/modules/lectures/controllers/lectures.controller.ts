import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { LecturesService } from '../services/lectures.service';
import { CreateLectureDto } from '../dtos/create-lecture.dto';
import { CreateLectureFileDto } from '../dtos/create-lecture-file.dto';
import { UpdateLectureFileDto } from '../dtos/update-lecture-file.dto';
import { UpdateLectureDto } from '../dtos/update-lecture.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { UpdateVideoDto } from '../dtos/update-video.dto';
import { CreateVideoDto } from '../dtos/create-video.dto';
import { UploadVideoDto } from '../dtos/upload-video.dto';
import { CreateQuestionDto } from '../dtos/create-question.dto';
import { UpdateQuestionDto } from '../dtos/update-question.dto';
import { CreateVideoSegmentDto } from '../dtos/create-video-segment.dto';
import { UpdateVideoSegmentDto } from '../dtos/update-video-segment.dto';

@ApiTags('lectures')
@ApiBearerAuth()
@Controller('lectures')
export class LecturesController {
  constructor(private readonly lectures: LecturesService) {}

  @Post()
  @ApiOperation({ summary: 'Create lecture' })
  @ApiOkResponse({ description: 'Lecture created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  create(@Body() dto: CreateLectureDto, @Req() req: any) {
    return this.lectures.createLecture(dto, req.user);
  }

  @Get('course/:courseId')
  @ApiOperation({ summary: 'List lectures for course' })
  @ApiParam({ name: 'courseId', type: String, format: 'uuid', description: 'Course UUID' })
  @UseGuards(JwtAuthGuard)
  list(@Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string, @Req() req: any) {
    return this.lectures.listLectures(courseId, req.user);
  }

  @Get(':lectureId/details')
  @ApiOperation({ summary: 'Get lecture details with files, videos, and automated questions' })
  @UseGuards(JwtAuthGuard)
  getDetails(@Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string, @Req() req: any) {
    return this.lectures.getLectureDetails(lectureId, req.user);
  }

  @Patch(':lectureId')
  @ApiOperation({ summary: 'Update lecture' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  update(@Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string, @Body() body: UpdateLectureDto, @Req() req: any) {
    return this.lectures.updateLecture(lectureId, body, req.user);
  }

  @Delete(':lectureId')
  @ApiOperation({ summary: 'Delete lecture' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string, @Req() req: any) {
    return this.lectures.deleteLecture(lectureId, req.user);
  }

  @Post(':lectureId/files')
  @ApiOperation({ summary: 'Upload lecture file to Bunny storage' })
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
  uploadFile(@Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string, @UploadedFile() file: any, @Req() req: any) {
    return this.lectures.uploadLectureFile(lectureId, file, req.user);
  }

  @Post('files')
  @ApiOperation({ summary: 'Create lecture file by URL' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createFile(@Body() dto: CreateLectureFileDto, @Req() req: any) {
    return this.lectures.createLectureFile(dto, req.user);
  }

  @Delete('files/:id')
  @ApiOperation({ summary: 'Delete lecture file' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removeFile(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.lectures.deleteLectureFile(id, req.user);
  }

  @Patch('files/:id')
  @ApiOperation({ summary: 'Update lecture file metadata (owner or admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateFile(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateLectureFileDto, @Req() req: any) {
    return this.lectures.updateLectureFile(id, dto, req.user);
  }


  @Post('videos')
  @ApiOperation({ summary: 'Create video for lecture' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createVideo(@Body() dto: CreateVideoDto, @Req() req: any) {
    return this.lectures.createVideo(dto, req.user);
  }

  @Post(':lectureId/videos/upload')
  @ApiOperation({ summary: 'Upload lecture video to Bunny Stream' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        videoName: { type: 'string' },
        description: { type: 'string' },
        isFree: { type: 'boolean' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  uploadVideo(
    @Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string,
    @UploadedFile() file: any,
    @Body() body: UploadVideoDto,
    @Req() req: any,
  ) {
    return this.lectures.uploadLectureVideo(lectureId, file, body, req.user);
  }

  @Patch('videos/:id')
  @ApiOperation({ summary: 'Update video metadata (owner or admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateVideo(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateVideoDto, @Req() req: any) {
    return this.lectures.updateVideo(id, dto, req.user);
  }

  @Delete('videos/:id')
  @ApiOperation({ summary: 'Delete video and related records (owner or admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteVideo(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.lectures.deleteVideo(id, req.user);
  }

  @Post('videos/:videoId/segments')
  @ApiOperation({ summary: 'Create a video segment (owner or admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createVideoSegment(
    @Param('videoId', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Body() dto: CreateVideoSegmentDto,
    @Req() req: any,
  ) {
    return this.lectures.createVideoSegment(videoId, dto, req.user);
  }

  @Get('videos/:videoId/segments')
  @ApiOperation({ summary: 'List video segments' })
  @UseGuards(JwtAuthGuard)
  listVideoSegments(
    @Param('videoId', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Req() req: any,
  ) {
    return this.lectures.listVideoSegments(videoId, req.user);
  }

  @Patch('videos/:videoId/segments/:segmentId')
  @ApiOperation({ summary: 'Update a video segment (owner or admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateVideoSegment(
    @Param('videoId', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Param('segmentId', new ParseUUIDPipe({ version: '4' })) segmentId: string,
    @Body() dto: UpdateVideoSegmentDto,
    @Req() req: any,
  ) {
    return this.lectures.updateVideoSegment(videoId, segmentId, dto, req.user);
  }

  @Delete('videos/:videoId/segments/:segmentId')
  @ApiOperation({ summary: 'Delete a video segment (owner or admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteVideoSegment(
    @Param('videoId', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Param('segmentId', new ParseUUIDPipe({ version: '4' })) segmentId: string,
    @Req() req: any,
  ) {
    return this.lectures.deleteVideoSegment(videoId, segmentId, req.user);
  }

  @Post(':lectureId/questions')
  @ApiOperation({ summary: 'Create question with options for lecture' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createQuestion(@Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string, @Body() dto: CreateQuestionDto, @Req() req: any) {
    return this.lectures.createQuestion({ ...dto, lectureId }, req.user);
  }

  @Get(':lectureId/questions')
  @ApiOperation({ summary: 'List questions for lecture' })
  @UseGuards(JwtAuthGuard)
  listQuestions(@Param('lectureId', new ParseUUIDPipe({ version: '4' })) lectureId: string, @Req() req: any) {
    return this.lectures.listQuestions(lectureId, req.user);
  }

  @Patch('questions/:id')
  @ApiOperation({ summary: 'Update question' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateQuestion(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Body() dto: UpdateQuestionDto, @Req() req: any) {
    return this.lectures.updateQuestion(id, dto, req.user);
  }

  @Delete('questions/:id')
  @ApiOperation({ summary: 'Delete question' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteQuestion(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.lectures.deleteQuestion(id, req.user);
  }
}
