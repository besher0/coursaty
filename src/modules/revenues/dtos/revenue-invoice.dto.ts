import { ApiProperty } from '@nestjs/swagger';

export class RevenueInvoiceFiltersDto {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  courseId: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date' })
  dateFrom: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date' })
  dateTo: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 2026 })
  year: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 1, maximum: 12, example: 7 })
  month: number | null;
}

export class RevenueSummaryDto {
  @ApiProperty({ description: 'Number of activation and renewal transactions' })
  totalSubscribers: number;

  @ApiProperty({ description: 'Number of distinct students represented by the transactions' })
  uniqueSubscribersCount: number;

  @ApiProperty({ example: 2000 })
  totalDiscount: number;

  @ApiProperty({ example: 20000, description: 'Course list prices before any discount' })
  grossRevenue: number;

  @ApiProperty({ example: 1000, description: 'Part of totalDiscount from the course discount' })
  courseDiscount: number;

  @ApiProperty({ example: 1000, description: 'Part of totalDiscount from discount codes' })
  codeDiscount: number;

  @ApiProperty({ example: 2, description: 'First-time subscriptions' })
  initialSubscriptions: number;

  @ApiProperty({ example: 0, description: 'Subscription renewals' })
  renewals: number;

  @ApiProperty({ example: 18000, description: 'Full amount paid after discounts' })
  totalRevenues: number;

  @ApiProperty({ example: 12600 })
  teacherRevenue: number;

  @ApiProperty({ example: 5400 })
  platformRevenue: number;
}

export class RevenueDiscountDto {
  @ApiProperty({ example: 10, description: 'Effective discount; always present, including 0%' })
  percentage: number;

  @ApiProperty({ example: 1000 })
  amountPerSubscriber: number;

  @ApiProperty({ example: 2000 })
  totalAmount: number;

  @ApiProperty({ example: 500 })
  courseAmountPerSubscriber: number;

  @ApiProperty({ example: 500 })
  codeAmountPerSubscriber: number;
}

export class RevenueLineItemDto {
  @ApiProperty({ example: 10000 })
  coursePrice: number;

  @ApiProperty({ example: 2, description: 'Number of activation and renewal transactions at this price' })
  subscribersCount: number;

  @ApiProperty({ example: 2 })
  uniqueSubscribersCount: number;

  @ApiProperty({ type: RevenueDiscountDto })
  discount: RevenueDiscountDto;

  @ApiProperty({ example: 18000 })
  subtotal: number;

  @ApiProperty({ example: 70 })
  teacherPercentage: number;

  @ApiProperty({ example: 12600 })
  teacherRevenue: number;

  @ApiProperty({ example: 5400 })
  platformRevenue: number;
}

export class RevenueInvoiceCourseIdentityDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  teacherName: string | null;
}

export class RevenueCodeGroupBreakdownDto {
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'null: subscriptions without a code (approved payment receipts)',
  })
  codeGroupId: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Code batch name' })
  batchName: string | null;

  @ApiProperty({ example: 10 })
  discountPercentage: number;

  @ApiProperty({ example: 2, description: 'Subscriptions made with this batch' })
  subscriptionsCount: number;

  @ApiProperty({ example: 1000, description: 'Total code discount granted' })
  discountAmount: number;

  @ApiProperty({ example: 9000, description: 'Total paid through this batch' })
  revenue: number;
}

export class RevenueCourseInvoiceDto {
  @ApiProperty({ type: RevenueInvoiceCourseIdentityDto })
  course: RevenueInvoiceCourseIdentityDto;

  @ApiProperty({ type: [RevenueLineItemDto] })
  lineItems: RevenueLineItemDto[];

  @ApiProperty({
    type: [RevenueCodeGroupBreakdownDto],
    description: 'Revenue and discounts per code batch sold for this course',
  })
  codeGroups: RevenueCodeGroupBreakdownDto[];

  @ApiProperty({ type: RevenueSummaryDto })
  summary: RevenueSummaryDto;
}

export class RevenueMonthDto {
  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ example: 7, minimum: 1, maximum: 12, description: 'Month in Asia/Damascus' })
  month: number;

  @ApiProperty({ example: 2, description: 'Activations and renewals in the month' })
  subscriptions: number;

  @ApiProperty({ example: 18000, description: 'Amount paid after discounts' })
  totalRevenues: number;

  @ApiProperty({ example: 12600 })
  teacherRevenue: number;

  @ApiProperty({ example: 5400 })
  platformRevenue: number;
}

export class RevenueInvoiceDto {
  @ApiProperty({ enum: ['SYP'], example: 'SYP' })
  currency: 'SYP';

  @ApiProperty({ enum: ['Asia/Damascus'], example: 'Asia/Damascus' })
  timezone: 'Asia/Damascus';

  @ApiProperty({ type: RevenueInvoiceFiltersDto })
  filters: RevenueInvoiceFiltersDto;

  @ApiProperty({ type: [RevenueCourseInvoiceDto] })
  courses: RevenueCourseInvoiceDto[];

  @ApiProperty({ type: RevenueSummaryDto })
  summary: RevenueSummaryDto;

  @ApiProperty({
    type: [RevenueMonthDto],
    description: 'Totals per calendar month (Asia/Damascus), oldest first; months without sales are omitted',
  })
  monthly: RevenueMonthDto[];
}

