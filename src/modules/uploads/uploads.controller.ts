import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UploadsService } from './uploads.service';
import { UploadStreamVideoDto } from './dtos/upload-stream-video.dto';
import { UpdateBunnyVideoSettingsDto } from './dtos/update-bunny-video-settings.dto';
import { BUNNY_STREAM_RESOLUTIONS } from '@/shared/bunny/bunny-resolution.constants';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('files')
  @ApiOperation({ summary: 'Upload image/file to Bunny storage' })
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
  uploadFile(@UploadedFile() file: any) {
    return this.uploads.uploadFile(file);
  }

  @Post('videos')
  @ApiOperation({ summary: 'Upload video to Bunny Stream' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        preferredResolution: { type: 'string', enum: [...BUNNY_STREAM_RESOLUTIONS] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  uploadVideo(@UploadedFile() file: any, @Body() body: UploadStreamVideoDto) {
    return this.uploads.uploadVideo(file, body);
  }

  @Patch('videos/settings/resolutions')
  @ApiOperation({ summary: 'Update Bunny Stream library resolution settings (Bunny Cloud)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateVideoResolutionSettings(@Body() body: UpdateBunnyVideoSettingsDto) {
    return this.uploads.updateBunnyVideoSettings(body);
  }

  @Get('videos/:videoId/resolutions')
  @ApiOperation({ summary: 'Get available resolutions for Bunny Stream video (Bunny Cloud)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  getVideoResolutions(@Param('videoId') videoId: string) {
    return this.uploads.getBunnyVideoResolutions(videoId);
  }
}
