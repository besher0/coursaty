import { Injectable } from '@nestjs/common';
import { Prisma, RevenueTransaction } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RevenueInvoiceDto, RevenuePeriodInput, RevenueSummaryDto } from '../dtos';

export const REVENUE_TIMEZONE = 'Asia/Damascus' as const;
export const REVENUE_CURRENCY = 'SYP' as const;

export interface RevenueReportFilters extends RevenuePeriodInput {
  courseId?: string;
  teacherId?: string;
  universityId?: string;
  collegeId?: string;
}

export interface RevenueCourseSeed {
  id: string;
  name: string;
}

interface ResolvedRevenuePeriod {
  purchasedAt?: Prisma.DateTimeFilter;
}

type MutableSummary = RevenueSummaryDto & { uniqueStudentIds: Set<string> };

interface MutableLineItem {
  key: string;
  coursePrice: number;
  subscribersCount: number;
  uniqueStudentIds: Set<string>;
  courseDiscountPercentage: number;
  courseDiscountAmount: number;
  codeDiscountPercentage: number;
  codeDiscountAmount: number;
  finalPrice: number;
  teacherPercentage: number;
  totalDiscount: number;
  subtotal: number;
  teacherRevenue: number;
  platformRevenue: number;
}

interface MutableCourseInvoice {
  course: RevenueCourseSeed;
  lineItems: Map<string, MutableLineItem>;
  summary: MutableSummary;
}

@Injectable()
export class RevenueService {
  private readonly damascusFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REVENUE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  constructor(private readonly prisma: PrismaService) {}

  async findTransactions(filters: RevenueReportFilters = {}): Promise<RevenueTransaction[]> {
    return this.prisma.revenueTransaction.findMany({
      where: this.buildWhere(filters),
      orderBy: [{ purchasedAt: 'asc' }, { id: 'asc' }],
    });
  }

  async buildInvoice(
    filters: RevenueReportFilters = {},
    courseSeeds: RevenueCourseSeed[] = [],
  ): Promise<RevenueInvoiceDto> {
    const transactions = await this.findTransactions(filters);
    return this.buildInvoiceFromTransactions(transactions, filters, courseSeeds);
  }

  buildInvoiceFromTransactions(
    transactions: RevenueTransaction[],
    filters: RevenueReportFilters = {},
    courseSeeds: RevenueCourseSeed[] = [],
  ): RevenueInvoiceDto {
    const courses = new Map<string, MutableCourseInvoice>();
    const invoiceSummary = this.createMutableSummary();

    for (const seed of courseSeeds) {
      courses.set(seed.id, this.createMutableCourse(seed));
    }

    for (const transaction of transactions) {
      const course = courses.get(transaction.courseId) ??
        this.createMutableCourse({ id: transaction.courseId, name: transaction.courseName });
      courses.set(transaction.courseId, course);

      const coursePrice = this.toNumber(transaction.coursePrice);
      const courseDiscountPercentage = this.toNumber(transaction.courseDiscountPercentage);
      const courseDiscountAmount = this.toNumber(transaction.courseDiscountAmount);
      const codeDiscountPercentage = this.toNumber(transaction.codeDiscountPercentage);
      const codeDiscountAmount = this.toNumber(transaction.codeDiscountAmount);
      const finalPrice = this.toNumber(transaction.finalPrice);
      const teacherPercentage = this.toNumber(transaction.teacherPercentage);
      const teacherRevenue = this.toNumber(transaction.teacherRevenue);
      const platformRevenue = this.toNumber(transaction.platformRevenue);

      const key = [
        coursePrice,
        courseDiscountPercentage,
        courseDiscountAmount,
        codeDiscountPercentage,
        codeDiscountAmount,
        finalPrice,
        teacherPercentage,
        transaction.currency,
      ].join('|');

      let line = course.lineItems.get(key);
      if (!line) {
        line = {
          key,
          coursePrice,
          subscribersCount: 0,
          uniqueStudentIds: new Set<string>(),
          courseDiscountPercentage,
          courseDiscountAmount,
          codeDiscountPercentage,
          codeDiscountAmount,
          finalPrice,
          teacherPercentage,
          totalDiscount: 0,
          subtotal: 0,
          teacherRevenue: 0,
          platformRevenue: 0,
        };
        course.lineItems.set(key, line);
      }

      const discount = courseDiscountAmount + codeDiscountAmount;
      line.subscribersCount += 1;
      line.uniqueStudentIds.add(transaction.studentId);
      line.totalDiscount += discount;
      line.subtotal += finalPrice;
      line.teacherRevenue += teacherRevenue;
      line.platformRevenue += platformRevenue;

      this.addToSummary(course.summary, transaction.studentId, discount, finalPrice, teacherRevenue, platformRevenue);
      this.addToSummary(invoiceSummary, transaction.studentId, discount, finalPrice, teacherRevenue, platformRevenue);
    }

    const serializedCourses = Array.from(courses.values())
      .map((course) => ({
        course: course.course,
        lineItems: Array.from(course.lineItems.values())
          .map((line) => {
            const discountPerSubscriber = line.courseDiscountAmount + line.codeDiscountAmount;
            return {
              coursePrice: this.roundCurrency(line.coursePrice),
              subscribersCount: line.subscribersCount,
              uniqueSubscribersCount: line.uniqueStudentIds.size,
              discount: {
                percentage: this.roundPercentage(
                  line.coursePrice === 0 ? 0 : (discountPerSubscriber * 100) / line.coursePrice,
                ),
                amountPerSubscriber: this.roundCurrency(discountPerSubscriber),
                totalAmount: this.roundCurrency(line.totalDiscount),
                courseAmountPerSubscriber: this.roundCurrency(line.courseDiscountAmount),
                codeAmountPerSubscriber: this.roundCurrency(line.codeDiscountAmount),
              },
              subtotal: this.roundCurrency(line.subtotal),
              teacherPercentage: this.roundPercentage(line.teacherPercentage),
              teacherRevenue: this.roundCurrency(line.teacherRevenue),
              platformRevenue: this.roundCurrency(line.platformRevenue),
            };
          })
          .sort((a, b) => b.coursePrice - a.coursePrice || b.discount.percentage - a.discount.percentage),
        summary: this.serializeSummary(course.summary),
      }))
      .sort((a, b) =>
        b.summary.totalRevenues - a.summary.totalRevenues || a.course.name.localeCompare(b.course.name),
      );

    return {
      currency: REVENUE_CURRENCY,
      timezone: REVENUE_TIMEZONE,
      filters: {
        courseId: filters.courseId ?? null,
        dateFrom: filters.dateFrom ?? null,
        dateTo: filters.dateTo ?? null,
        year: filters.year ?? null,
        month: filters.month ?? null,
      },
      courses: serializedCourses,
      summary: this.serializeSummary(invoiceSummary),
    };
  }

  resolvePeriod(filters: RevenuePeriodInput = {}): ResolvedRevenuePeriod {
    if (filters.dateFrom && filters.dateTo) {
      const start = this.parseDateOnly(filters.dateFrom);
      const end = this.parseDateOnly(filters.dateTo);
      const nextEnd = this.addCalendarDays(end, 1);
      return {
        purchasedAt: {
          gte: this.zonedMidnightToUtc(start.year, start.month, start.day),
          lt: this.zonedMidnightToUtc(nextEnd.year, nextEnd.month, nextEnd.day),
        },
      };
    }

    if (filters.year !== undefined) {
      const startMonth = filters.month ?? 1;
      const endYear = filters.month === undefined || filters.month === 12 ? filters.year + 1 : filters.year;
      const endMonth = filters.month === undefined || filters.month === 12 ? 1 : filters.month + 1;
      return {
        purchasedAt: {
          gte: this.zonedMidnightToUtc(filters.year, startMonth, 1),
          lt: this.zonedMidnightToUtc(endYear, endMonth, 1),
        },
      };
    }

    return {};
  }

  private buildWhere(filters: RevenueReportFilters): Prisma.RevenueTransactionWhereInput {
    return {
      ...(filters.courseId ? { courseId: filters.courseId } : {}),
      ...(filters.teacherId ? { teacherId: filters.teacherId } : {}),
      ...(filters.universityId ? { universityId: filters.universityId } : {}),
      ...(filters.collegeId ? { collegeId: filters.collegeId } : {}),
      ...this.resolvePeriod(filters),
    };
  }

  private createMutableCourse(course: RevenueCourseSeed): MutableCourseInvoice {
    return { course, lineItems: new Map(), summary: this.createMutableSummary() };
  }

  private createMutableSummary(): MutableSummary {
    return {
      totalSubscribers: 0,
      uniqueSubscribersCount: 0,
      totalDiscount: 0,
      totalRevenues: 0,
      teacherRevenue: 0,
      platformRevenue: 0,
      uniqueStudentIds: new Set<string>(),
    };
  }

  private addToSummary(
    summary: MutableSummary,
    studentId: string,
    discount: number,
    finalPrice: number,
    teacherRevenue: number,
    platformRevenue: number,
  ) {
    summary.totalSubscribers += 1;
    summary.uniqueStudentIds.add(studentId);
    summary.totalDiscount += discount;
    summary.totalRevenues += finalPrice;
    summary.teacherRevenue += teacherRevenue;
    summary.platformRevenue += platformRevenue;
  }

  private serializeSummary(summary: MutableSummary): RevenueSummaryDto {
    return {
      totalSubscribers: summary.totalSubscribers,
      uniqueSubscribersCount: summary.uniqueStudentIds.size,
      totalDiscount: this.roundCurrency(summary.totalDiscount),
      totalRevenues: this.roundCurrency(summary.totalRevenues),
      teacherRevenue: this.roundCurrency(summary.teacherRevenue),
      platformRevenue: this.roundCurrency(summary.platformRevenue),
    };
  }

  private parseDateOnly(value: string): { year: number; month: number; day: number } {
    const [year, month, day] = value.split('-').map(Number);
    return { year, month, day };
  }

  private addCalendarDays(
    value: { year: number; month: number; day: number },
    days: number,
  ): { year: number; month: number; day: number } {
    const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  private zonedMidnightToUtc(year: number, month: number, day: number): Date {
    const desiredAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
    let candidate = desiredAsUtc;

    // Resolve the IANA offset through Intl rather than relying on the server timezone.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = this.damascusFormatter.formatToParts(new Date(candidate));
      const values = Object.fromEntries(
        parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
      ) as Record<string, number>;
      const representedAsUtc = Date.UTC(
        values.year,
        values.month - 1,
        values.day,
        values.hour,
        values.minute,
        values.second,
      );
      const offset = representedAsUtc - candidate;
      const resolved = desiredAsUtc - offset;
      if (resolved === candidate) break;
      candidate = resolved;
    }

    return new Date(candidate);
  }

  private toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  private roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private roundPercentage(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
