import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface RevenuePeriodInput {
  dateFrom?: string;
  dateTo?: string;
  year?: number;
  month?: number;
}

@ValidatorConstraint({ name: 'RevenuePeriodCombination', async: false })
export class RevenuePeriodCombinationConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const value = args.object as RevenuePeriodInput;
    const hasDateFrom = value.dateFrom !== undefined;
    const hasDateTo = value.dateTo !== undefined;
    const hasDateRange = hasDateFrom || hasDateTo;
    const hasYear = value.year !== undefined;
    const hasMonth = value.month !== undefined;

    if (hasDateFrom !== hasDateTo) {
      return false;
    }

    if (hasDateRange && (hasYear || hasMonth)) {
      return false;
    }

    if (hasMonth && !hasYear) {
      return false;
    }

    if (hasDateFrom && hasDateTo && value.dateFrom! > value.dateTo!) {
      return false;
    }

    return true;
  }

  defaultMessage(): string {
    return 'Use dateFrom and dateTo together, or year with an optional month; the two period formats cannot be combined';
  }
}

export class RevenuePeriodQueryDto implements RevenuePeriodInput {
  @ApiPropertyOptional({
    format: 'date',
    example: '2026-07-01',
    description: 'Inclusive start date in Asia/Damascus (must be supplied with dateTo)',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  dateFrom?: string;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-07-31',
    description: 'Inclusive end date in Asia/Damascus (must be supplied with dateFrom)',
  })
  @IsOptional()
  @Matches(DATE_ONLY_PATTERN)
  @IsDateString({ strict: true })
  dateTo?: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1970,
    maximum: 9999,
    example: 2026,
    description: 'Calendar year in Asia/Damascus',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(9999)
  year?: number;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 12,
    example: 7,
    description: 'Calendar month in Asia/Damascus; requires year',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @Validate(RevenuePeriodCombinationConstraint)
  private readonly periodCombination?: never;
}
