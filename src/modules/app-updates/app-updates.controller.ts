import { Body, Controller, Get, Param, ParseEnumPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AppUpdatesService } from './app-updates.service';
import {
  APP_PLATFORMS,
  AppPlatform,
  AppUpdateCheckQueryDto,
  UpsertAppReleasePolicyDto,
} from './dtos/app-update.dto';

const platformPipe = new ParseEnumPipe(
  Object.fromEntries(APP_PLATFORMS.map((p) => [p, p])),
);

@ApiTags('app-updates')
@Controller('app-updates')
export class AppUpdatesController {
  constructor(private readonly appUpdates: AppUpdatesService) {}

  @Get()
  @ApiOperation({ summary: 'Release policy of every platform (admin only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  list() {
    return this.appUpdates.list();
  }

  @Put(':platform')
  @ApiOperation({ summary: 'Set the newest release of a platform and whether it is required (admin only)' })
  @ApiParam({ name: 'platform', enum: APP_PLATFORMS })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  upsert(
    @Param('platform', platformPipe) platform: AppPlatform,
    @Body() dto: UpsertAppReleasePolicyDto,
  ) {
    return this.appUpdates.upsert(platform, dto);
  }

  // Public: the app checks before anyone signs in.
  @Get(':platform/check')
  @ApiOperation({ summary: 'Whether the installed build must or may be updated' })
  @ApiParam({ name: 'platform', enum: APP_PLATFORMS })
  check(
    @Param('platform', platformPipe) platform: AppPlatform,
    @Query() query: AppUpdateCheckQueryDto,
  ) {
    return this.appUpdates.check(platform, query.build);
  }
}
