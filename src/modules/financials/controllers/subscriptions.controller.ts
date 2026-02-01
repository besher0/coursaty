import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FinancialsService } from '../services/financials.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('financials')
@ApiBearerAuth()
@Controller('financials/subscriptions')
export class SubscriptionsController {
  constructor(private readonly financials: FinancialsService) {}

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe to a course with optional discount code' })
  @ApiOkResponse({ description: 'Subscription created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  subscribe(@Body() body: { courseId: number; codeValue?: string }, @Req() req: any) {
    return this.financials.subscribeWithCode(req.user, body.courseId, body.codeValue);
  }

  @Get()
  @ApiOperation({ summary: 'List subscriptions (admin/teacher)' })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'courseId', required: false })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'TEACHER')
  list(@Query('studentId') studentId?: string, @Query('courseId') courseId?: string) {
    return this.financials.listSubscriptions({
      studentId: studentId ? Number(studentId) : undefined,
      courseId: courseId ? Number(courseId) : undefined,
    });
  }
}
