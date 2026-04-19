import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InteractionsService } from '../services/interactions.service';
import { RateCourseDto } from '../dtos/rate-course.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('interactions')
@ApiBearerAuth()
@Controller('interactions/courses')
export class CourseRatingsController {
  constructor(private readonly interactions: InteractionsService) {}

  @Get(':courseId/rate')
  @ApiOperation({ summary: 'Get current student rating for a course' })
  @ApiOkResponse({ description: 'Course rating fetched successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getMyCourseRating(
    @Param('courseId', new ParseUUIDPipe({ version: '4' })) courseId: string,
    @Req() req: any,
  ) {
    return this.interactions.getMyCourseRating(courseId, req.user);
  }

  @Post('rate')
  @ApiOperation({ summary: 'Rate course (1 to 5)' })
  @ApiOkResponse({ description: 'Course rated successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  rateCourse(@Body() body: RateCourseDto, @Req() req: any) {
    return this.interactions.rateCourse(body.courseId, body.rating, req.user);
  }
}
