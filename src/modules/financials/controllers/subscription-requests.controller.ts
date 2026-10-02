import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { FinancialsService } from '../services/financials.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CreateSubscriptionRequestDto } from '../dtos/create-subscription-request.dto';
import { ListSubscriptionRequestsQueryDto } from '../dtos/list-subscription-requests-query.dto';
import { ReviewSubscriptionRequestDto } from '../dtos/review-subscription-request.dto';
import { RejectSubscriptionRequestDto } from '../dtos/reject-subscription-request.dto';
import { CreateSubscriptionRequestWithReceiptDto } from '../dtos/create-subscription-request-with-receipt.dto';
import { ResubmitSubscriptionRequestWithReceiptDto } from '../dtos/resubmit-subscription-request-with-receipt.dto';
import { UploadsService } from '../../uploads/uploads.service';

@ApiTags('financials')
@ApiBearerAuth()
@Controller('financials/subscription-requests')
export class SubscriptionRequestsController {
  constructor(
    private readonly financials: FinancialsService,
    private readonly uploads: UploadsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Request course subscription with a payment receipt' })
  @ApiOkResponse({ description: 'Subscription request created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  create(@Body() body: CreateSubscriptionRequestDto, @Req() req: any) {
    return this.financials.createSubscriptionRequest(req.user, body);
  }

  @Post('with-receipt')
  @ApiOperation({ summary: 'Upload payment receipt and create subscription request in one call' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['courseId', 'file'],
      properties: {
        courseId: { type: 'string', format: 'uuid' },
        note: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ description: 'Receipt uploaded and subscription request created' })
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  async createWithReceipt(
    @UploadedFile() file: any,
    @Body() body: CreateSubscriptionRequestWithReceiptDto,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('صورة إيصال الدفع مطلوبة');

    const receipt = await this.uploads.uploadSubscriptionReceipt(file);
    return this.financials.createSubscriptionRequest(req.user, {
      courseId: body.courseId,
      receiptUrl: receipt.fileUrl,
      receiptFileName: receipt.fileName,
      receiptMimeType: receipt.mimeType,
      receiptSizeBytes: receipt.sizeBytes,
      note: body.note,
    });
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

  @Patch(':id/resubmit')
  @ApiOperation({ summary: 'Resubmit a rejected subscription request with a new payment receipt' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        note: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  async resubmit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile() file: any,
    @Body() body: ResubmitSubscriptionRequestWithReceiptDto,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('صورة إيصال الدفع مطلوبة');

    const receipt = await this.uploads.uploadSubscriptionReceipt(file);
    return this.financials.resubmitSubscriptionRequest(id, req.user, {
      receiptUrl: receipt.fileUrl,
      receiptFileName: receipt.fileName,
      receiptMimeType: receipt.mimeType,
      receiptSizeBytes: receipt.sizeBytes,
      note: body.note,
    });
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
