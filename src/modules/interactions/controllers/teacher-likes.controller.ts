import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InteractionsService } from '../services/interactions.service';
import { LikeTeacherDto } from '../dtos/like-teacher.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('interactions')
@ApiBearerAuth()
@Controller('interactions/teachers')
export class TeacherLikesController {
  constructor(private readonly interactions: InteractionsService) {}

  @Post('like')
  @ApiOperation({ summary: 'Like a teacher' })
  @ApiOkResponse({ description: 'Teacher liked' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  like(@Body() body: LikeTeacherDto, @Req() req: any) {
    return this.interactions.likeTeacher(body.teacherId, req.user);
  }

  @Delete('like')
  @ApiOperation({ summary: 'Remove like from teacher' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  removeLike(@Body() body: LikeTeacherDto, @Req() req: any) {
    return this.interactions.deleteTeacherLike(body.teacherId, req.user);
  }
}
