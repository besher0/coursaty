import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinancialsService } from '../services/financials.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CreateSubscriptionRequestDto } from '../dtos/create-subscription-request.dto';
import { ListSubscriptionRequestsQueryDto } from '../dtos/list-subscription-requests-query.dto';
import { ReviewSubscriptionRequestDto } from '../dtos/review-subscription-request.dto';
import { RejectSubscriptionRequestDto } from '../dtos/reject-subscription-request.dto';

@ApiTags('financials')
@ApiBearerAuth()
@Controller('financials/subscription-requests')
export class SubscriptionRequestsController {
  constructor(private readonly financials: FinancialsService) {}

  @Post()
  @ApiOperation({ summary: 'Request course subscription with a payment receipt' })
  @ApiOkResponse({ description: 'Subscription request created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  create(@Body() body: CreateSubscriptionRequestDto, @Req() req: any) {
    return this.financials.createSubscriptionRequest(req.user, body);
  }

  @Get('me')
  @ApiOperation({ summary: 'List current student subscription requests' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  listMine(@Query() query: ListSubscriptionRequestsQueryDto, @Req() req: any) {
    return this.financials.listMySubscriptionRequests(req.user, query.status);
  }

  @Get('me/:id')
  @ApiOperation({ summary: 'Get one of the current student subscription requests (own only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  getMine(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: any,
  ) {
    return this.financials.getMySubscriptionRequestDetail(req.user, id);
  }

  @Get()
  @ApiOperation({ summary: 'List subscription requests for admin' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  list(@Query() query: ListSubscriptionRequestsQueryDto) {
    return this.financials.listSubscriptionRequests(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get subscription request details (admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  getDetail(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financials.getSubscriptionRequestDetail(id);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a subscription request and activate the course' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  approve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ReviewSubscriptionRequestDto,
    @Req() req: any,
  ) {
    return this.financials.approveSubscriptionRequest(id, req.user, body);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a subscription request (reason is mandatory)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: RejectSubscriptionRequestDto,
    @Req() req: any,
  ) {
    return this.financials.rejectSubscriptionRequest(id, req.user, body);
  }
}
