import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export const APP_PLATFORMS = ['android', 'ios'] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/** FLEXIBLE: the app offers the update and can be used without it. FORCE: blocked until updated. */
export const APP_UPDATE_MODES = ['FLEXIBLE', 'FORCE'] as const;
export type AppUpdateMode = (typeof APP_UPDATE_MODES)[number];

export class UpsertAppReleasePolicyDto {
  @ApiProperty({ example: '2.1.1', description: 'Version name shown to users' })
  @IsString()
  @Matches(/^\d+(\.\d+){0,3}$/)
  @MaxLength(32)
  latestVersion: string;

  @ApiProperty({
    example: 7,
    description: 'Build number of that version (the part after "+" in pubspec). Installs with a lower build are out of date.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  latestBuild: number;

  @ApiProperty({ enum: APP_UPDATE_MODES })
  @IsIn(APP_UPDATE_MODES)
  mode: AppUpdateMode;

  @ApiPropertyOptional({ description: 'Store page (Google Play / App Store)' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https', 'market', 'itms-apps'] })
  @MaxLength(500)
  storeUrl?: string | null;

  @ApiPropertyOptional({ description: 'Direct download for installs from outside the store (Android)' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(500)
  downloadUrl?: string | null;

  @ApiPropertyOptional({ description: 'Message shown with the update (what is new)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string | null;
}

export class AppUpdateCheckQueryDto {
  @ApiProperty({ example: 6, description: 'Build number of the installed app' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  build: number;
}
