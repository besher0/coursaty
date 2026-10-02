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
}

export class RevenueCourseInvoiceDto {
  @ApiProperty({ type: RevenueInvoiceCourseIdentityDto })
  course: RevenueInvoiceCourseIdentityDto;

  @ApiProperty({ type: [RevenueLineItemDto] })
  lineItems: RevenueLineItemDto[];

  @ApiProperty({ type: RevenueSummaryDto })
  summary: RevenueSummaryDto;
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
}

