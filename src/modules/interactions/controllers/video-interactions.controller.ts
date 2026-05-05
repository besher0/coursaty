import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InteractionsService } from '../services/interactions.service';
import { CreateVideoInteractionDto } from '../dtos/create-video-interaction.dto';
import { UpdateVideoInteractionDto } from '../dtos/update-video-interaction.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('interactions')
@ApiBearerAuth()
@Controller('interactions/videos')
export class VideoInteractionsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create/update video like interaction (toggle/set)' })
  @ApiOkResponse({ description: 'Interaction stored or updated' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  create(@Body() body: CreateVideoInteractionDto, @Req() req: any) {
    return this.interactions.interactVideo(body.videoId, req.user, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update video interaction' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateVideoInteractionDto,
    @Req() req: any,
  ) {
    return this.interactions.updateVideoInteraction(id, req.user, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete video interaction' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.interactions.deleteVideoInteraction(id, req.user);
  }

  @Post(':id/view')
  @ApiOperation({ summary: 'Increment video view with access control' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  incrementView(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.interactions.incrementVideoView(id, req.user);
  }

  @Get(':id/likes')
  @ApiOperation({ summary: 'Get likes count and current student like status for a video' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getVideoLikes(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() req: any) {
    return this.interactions.getVideoLikes(id, req.user);
  }
}
