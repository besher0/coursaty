import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { LecturesService } from '../services/lectures.service';
import { CreateLectureDto } from '../dtos/create-lecture.dto';
import { CreateLectureFileDto } from '../dtos/create-lecture-file.dto';
import { UpdateLectureDto } from '../dtos/update-lecture.dto';
import { CreateAutomationDto } from '../dtos/create-automation.dto';
import { UpdateAutomationDto } from '../dtos/update-automation.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { UpdateVideoDto } from '../dtos/update-video.dto';
import { CreateVideoDto } from '../dtos/create-video.dto';
import { CreateQuestionDto } from '../dtos/create-question.dto';
import { UpdateQuestionDto } from '../dtos/update-question.dto';

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
  @UseGuards(JwtAuthGuard)
  list(@Param('courseId', ParseIntPipe) courseId: number, @Req() req: any) {
    return this.lectures.listLectures(courseId, req.user);
  }

  @Patch(':lectureId')
  @ApiOperation({ summary: 'Update lecture' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  update(@Param('lectureId', ParseIntPipe) lectureId: number, @Body() body: UpdateLectureDto, @Req() req: any) {
    return this.lectures.updateLecture(lectureId, body, req.user);
  }

  @Delete(':lectureId')
  @ApiOperation({ summary: 'Delete lecture' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('lectureId', ParseIntPipe) lectureId: number, @Req() req: any) {
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
  uploadFile(@Param('lectureId', ParseIntPipe) lectureId: number, @UploadedFile() file: any, @Req() req: any) {
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
  removeFile(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.lectures.deleteLectureFile(id, req.user);
  }

  @Post(':lectureId/automations')
  @ApiOperation({ summary: 'Create automation for lecture' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createAutomation(@Param('lectureId', ParseIntPipe) lectureId: number, @Body() dto: CreateAutomationDto, @Req() req: any) {
    return this.lectures.createAutomation({ ...dto, lectureId }, req.user);
  }

  @Get(':lectureId/automations')
  @ApiOperation({ summary: 'List automations for lecture' })
  @UseGuards(JwtAuthGuard)
  listAutomations(@Param('lectureId', ParseIntPipe) lectureId: number, @Req() req: any) {
    return this.lectures.listAutomations(lectureId, req.user);
  }

  @Patch('automations/:id')
  @ApiOperation({ summary: 'Update automation' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateAutomation(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAutomationDto, @Req() req: any) {
    return this.lectures.updateAutomation(id, dto, req.user);
  }

  @Delete('automations/:id')
  @ApiOperation({ summary: 'Delete automation' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removeAutomation(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.lectures.deleteAutomation(id, req.user);
  }

  @Post('videos')
  @ApiOperation({ summary: 'Create video for lecture' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createVideo(@Body() dto: CreateVideoDto, @Req() req: any) {
    return this.lectures.createVideo(dto, req.user);
  }

  @Patch('videos/:id')
  @ApiOperation({ summary: 'Update video metadata (owner or admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateVideo(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVideoDto, @Req() req: any) {
    return this.lectures.updateVideo(id, dto, req.user);
  }

  @Delete('videos/:id')
  @ApiOperation({ summary: 'Delete video and related records (owner or admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteVideo(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.lectures.deleteVideo(id, req.user);
  }

  @Post('questions')
  @ApiOperation({ summary: 'Create question with options for automation' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  createQuestion(@Body() dto: CreateQuestionDto, @Req() req: any) {
    return this.lectures.createQuestion(dto, req.user);
  }

  @Get('automations/:automationId/questions')
  @ApiOperation({ summary: 'List questions for automation' })
  @UseGuards(JwtAuthGuard)
  listQuestions(@Param('automationId', ParseIntPipe) automationId: number, @Req() req: any) {
    return this.lectures.listQuestions(automationId, req.user);
  }

  @Patch('questions/:id')
  @ApiOperation({ summary: 'Update question' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  updateQuestion(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuestionDto, @Req() req: any) {
    return this.lectures.updateQuestion(id, dto, req.user);
  }

  @Delete('questions/:id')
  @ApiOperation({ summary: 'Delete question' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  deleteQuestion(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.lectures.deleteQuestion(id, req.user);
  }
}
