import { Injectable } from '@nestjs/common';
import { Prisma, RevenueTransaction } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RevenueInvoiceDto, RevenueMonthDto, RevenuePeriodInput, RevenueSummaryDto } from '../dtos';

export const REVENUE_TIMEZONE = 'Asia/Damascus' as const;
export const REVENUE_CURRENCY = 'SYP' as const;

export interface RevenueReportFilters extends RevenuePeriodInput {
  courseId?: string;
  teacherId?: string;
  universityId?: string;
  collegeId?: string;
  /** Only subscriptions activated with a code (whatever its discount). */
  withCode?: boolean;
}

export interface RevenueCourseSeed {
  id: string;
  name: string;
  teacherName?: string | null;
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

interface MutableCodeGroupBreakdown {
  codeGroupId: string | null;
  discountPercentage: number;
  subscriptionsCount: number;
  discountAmount: number;
  revenue: number;
}

interface MutableCourseInvoice {
  course: RevenueCourseSeed;
  lineItems: Map<string, MutableLineItem>;
  codeGroups: Map<string, MutableCodeGroupBreakdown>;
  summary: MutableSummary;
}

/** The amounts of one transaction that summaries add up. */
interface TransactionAmounts {
  studentId: string;
  renewal: boolean;
  coursePrice: number;
  courseDiscountAmount: number;
  codeDiscountAmount: number;
  finalPrice: number;
  teacherRevenue: number;
  platformRevenue: number;
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

  /**
   * Totals of the transactions matching [filters], summed by the database.
   *
   * Dashboards must read money and subscription counts from here (or from an
   * invoice) rather than from StudentSubscription rows: a renewal rewrites the
   * subscription row, and the teacher share is stored per transaction.
   */
  async sumTransactions(filters: RevenueReportFilters = {}): Promise<{
    subscriptions: number;
    codeDiscount: number;
    totalRevenues: number;
    teacherRevenue: number;
    platformRevenue: number;
  }> {
    const result = await this.prisma.revenueTransaction.aggregate({
      where: this.buildWhere(filters),
      _count: { _all: true },
      _sum: {
        codeDiscountAmount: true,
        finalPrice: true,
        teacherRevenue: true,
        platformRevenue: true,
      },
    });
    return {
      subscriptions: result._count._all,
      codeDiscount: this.roundCurrency(this.toNumber(result._sum.codeDiscountAmount)),
      totalRevenues: this.roundCurrency(this.toNumber(result._sum.finalPrice)),
      teacherRevenue: this.roundCurrency(this.toNumber(result._sum.teacherRevenue)),
      platformRevenue: this.roundCurrency(this.toNumber(result._sum.platformRevenue)),
    };
  }

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
    const codeGroupNames = await this.findCodeGroupNames(transactions);
    return this.buildInvoiceFromTransactions(
      transactions,
      filters,
      courseSeeds,
      codeGroupNames,
    );
  }

  /** Batch names of the code groups used by [transactions]. */
  async findCodeGroupNames(
    transactions: Pick<RevenueTransaction, 'codeGroupId'>[],
  ): Promise<Map<string, string>> {
    const ids = Array.from(
      new Set(transactions.map((t) => t.codeGroupId).filter((id): id is string => !!id)),
    );
    if (ids.length === 0) return new Map();
    const groups = await this.prisma.codeGroup.findMany({
      where: { id: { in: ids } },
      select: { id: true, batchName: true },
    });
    return new Map(groups.map((group) => [group.id, group.batchName]));
  }

  buildInvoiceFromTransactions(
    transactions: RevenueTransaction[],
    filters: RevenueReportFilters = {},
    courseSeeds: RevenueCourseSeed[] = [],
    codeGroupNames: Map<string, string> = new Map(),
  ): RevenueInvoiceDto {
    const courses = new Map<string, MutableCourseInvoice>();
    const invoiceSummary = this.createMutableSummary();
    const months = new Map<string, RevenueMonthDto>();

    for (const seed of courseSeeds) {
      courses.set(seed.id, this.createMutableCourse(seed));
    }

    for (const transaction of transactions) {
      const course = courses.get(transaction.courseId) ??
        this.createMutableCourse({ id: transaction.courseId, name: transaction.courseName });
      courses.set(transaction.courseId, course);
      if (!course.course.teacherName && transaction.teacherName) {
        course.course = { ...course.course, teacherName: transaction.teacherName };
      }

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

      const groupKey = `${transaction.codeGroupId ?? 'none'}|${codeDiscountPercentage}`;
      let group = course.codeGroups.get(groupKey);
      if (!group) {
        group = {
          codeGroupId: transaction.codeGroupId ?? null,
          discountPercentage: codeDiscountPercentage,
          subscriptionsCount: 0,
          discountAmount: 0,
          revenue: 0,
        };
        course.codeGroups.set(groupKey, group);
      }
      group.subscriptionsCount += 1;
      group.discountAmount += codeDiscountAmount;
      group.revenue += finalPrice;

      const amounts: TransactionAmounts = {
        studentId: transaction.studentId,
        renewal: transaction.type === 'RENEWAL',
        coursePrice,
        courseDiscountAmount,
        codeDiscountAmount,
        finalPrice,
        teacherRevenue,
        platformRevenue,
      };
      this.addToSummary(course.summary, amounts);
      this.addToSummary(invoiceSummary, amounts);

      const { year, month } = this.damascusMonth(transaction.purchasedAt);
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      let monthTotals = months.get(monthKey);
      if (!monthTotals) {
        monthTotals = {
          year,
          month,
          subscriptions: 0,
          totalRevenues: 0,
          teacherRevenue: 0,
          platformRevenue: 0,
        };
        months.set(monthKey, monthTotals);
      }
      monthTotals.subscriptions += 1;
      monthTotals.totalRevenues += finalPrice;
      monthTotals.teacherRevenue += teacherRevenue;
      monthTotals.platformRevenue += platformRevenue;
    }

    const serializedCourses = Array.from(courses.values())
      .map((course) => ({
        course: {
          id: course.course.id,
          name: course.course.name,
          teacherName: course.course.teacherName ?? null,
        },
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
        codeGroups: Array.from(course.codeGroups.values())
          .map((group) => ({
            codeGroupId: group.codeGroupId,
            batchName: group.codeGroupId
              ? (codeGroupNames.get(group.codeGroupId) ?? null)
              : null,
            discountPercentage: this.roundPercentage(group.discountPercentage),
            subscriptionsCount: group.subscriptionsCount,
            discountAmount: this.roundCurrency(group.discountAmount),
            revenue: this.roundCurrency(group.revenue),
          }))
          .sort((a, b) => b.revenue - a.revenue),
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
      monthly: Array.from(months.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, totals]) => ({
          ...totals,
          totalRevenues: this.roundCurrency(totals.totalRevenues),
          teacherRevenue: this.roundCurrency(totals.teacherRevenue),
          platformRevenue: this.roundCurrency(totals.platformRevenue),
        })),
    };
  }

  /** Calendar month of [date] in Asia/Damascus: "this month" for every report. */
  damascusMonth(date: Date = new Date()): { year: number; month: number } {
    const parts = this.damascusFormatter.formatToParts(date);
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: value('year'), month: value('month') };
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
      ...(filters.withCode ? { codeId: { not: null } } : {}),
      ...this.resolvePeriod(filters),
    };
  }

  private createMutableCourse(course: RevenueCourseSeed): MutableCourseInvoice {
    return {
      course,
      lineItems: new Map(),
      codeGroups: new Map(),
      summary: this.createMutableSummary(),
    };
  }

  private createMutableSummary(): MutableSummary {
    return {
      totalSubscribers: 0,
      uniqueSubscribersCount: 0,
      totalDiscount: 0,
      grossRevenue: 0,
      courseDiscount: 0,
      codeDiscount: 0,
      initialSubscriptions: 0,
      renewals: 0,
      totalRevenues: 0,
      teacherRevenue: 0,
      platformRevenue: 0,
      uniqueStudentIds: new Set<string>(),
    };
  }

  private addToSummary(summary: MutableSummary, amounts: TransactionAmounts) {
    summary.totalSubscribers += 1;
    summary.uniqueStudentIds.add(amounts.studentId);
    if (amounts.renewal) summary.renewals += 1;
    else summary.initialSubscriptions += 1;
    summary.grossRevenue += amounts.coursePrice;
    summary.courseDiscount += amounts.courseDiscountAmount;
    summary.codeDiscount += amounts.codeDiscountAmount;
    summary.totalDiscount += amounts.courseDiscountAmount + amounts.codeDiscountAmount;
    summary.totalRevenues += amounts.finalPrice;
    summary.teacherRevenue += amounts.teacherRevenue;
    summary.platformRevenue += amounts.platformRevenue;
  }

  private serializeSummary(summary: MutableSummary): RevenueSummaryDto {
    return {
      totalSubscribers: summary.totalSubscribers,
      uniqueSubscribersCount: summary.uniqueStudentIds.size,
      totalDiscount: this.roundCurrency(summary.totalDiscount),
      grossRevenue: this.roundCurrency(summary.grossRevenue),
      courseDiscount: this.roundCurrency(summary.courseDiscount),
      codeDiscount: this.roundCurrency(summary.codeDiscount),
      initialSubscriptions: summary.initialSubscriptions,
      renewals: summary.renewals,
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
