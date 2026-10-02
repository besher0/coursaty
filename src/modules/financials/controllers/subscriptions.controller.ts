import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FinancialsService } from '../services/financials.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { SubscribeWithCodeDto } from '../dtos/subscribe-with-code.dto';

@ApiTags('financials')
@ApiBearerAuth()
@Controller('financials/subscriptions')
export class SubscriptionsController {
  constructor(private readonly financials: FinancialsService) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to or renew a course using a code' })
  @ApiOkResponse({ description: 'Subscription created or renewed' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  subscribe(@Body() body: SubscribeWithCodeDto, @Req() req: any) {
    return this.financials.subscribeWithCodeValue(req.user, body.codeValue);
  }

  @Get()
  @ApiOperation({ summary: 'List subscriptions (admin/teacher)' })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'courseId', required: false })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  list(@Query('studentId') studentId?: string, @Query('courseId') courseId?: string) {
    return this.financials.listSubscriptions({
      studentId,
      courseId,
    });
  }

  @Get('me/active-courses')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get active courses for current student' })
  @UseGuards(JwtAuthGuard)
  getActiveCourses(@Req() req: any) {
    return this.financials.getActiveCoursesByUser(req.user);
  }

  @Get('me/inactive-courses')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get inactive courses for current student' })
  @UseGuards(JwtAuthGuard)
  getInactiveCourses(@Req() req: any) {
    return this.financials.getInactiveCoursesByUser(req.user);
  }
}
