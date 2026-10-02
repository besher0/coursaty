import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GuestPreferencesService } from '../services/guest-preferences.service';
import { UpsertGuestPreferenceDto } from '../dtos/upsert-guest-preference.dto';

@ApiTags('guest-preferences')
@Controller('guest-preferences')
export class GuestPreferencesController {
  constructor(private readonly guestPreferencesService: GuestPreferencesService) {}

  @Post()
  @ApiOperation({ summary: 'Create or update guest preference by deviceId' })
  @ApiOkResponse({ description: 'Guest preference saved' })
  upsert(@Body() dto: UpsertGuestPreferenceDto) {
    return this.guestPreferencesService.upsert(dto);
  }

  @Get(':deviceId')
  @ApiOperation({ summary: 'Get guest preference by deviceId' })
  @ApiOkResponse({ description: 'Guest preference returned' })
  getByDeviceId(@Param('deviceId') deviceId: string) {
    return this.guestPreferencesService.getByDeviceId(deviceId);
  }

  @Delete(':deviceId')
  @ApiOperation({ summary: 'Delete guest preference by deviceId' })
  @ApiOkResponse({ description: 'Guest preference deleted (if exists)' })
  deleteByDeviceId(@Param('deviceId') deviceId: string) {
    return this.guestPreferencesService.deleteByDeviceId(deviceId);
  }
}
