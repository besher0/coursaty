import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/roles.decorator';
import { SystemSettingsService } from '../services/system-settings.service';
import { UpdateAppConfigDto } from '../dtos/app-config.dto';

@ApiTags('system-settings')
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettings: SystemSettingsService) {}

  // Public: the apps read it before anyone signs in.
  @Get('app-config')
  @ApiOperation({ summary: 'App settings (e.g. whether the iPhone app shows paid content)' })
  getAppConfig() {
    return this.systemSettings.getAppConfig();
  }

  @Patch('app-config')
  @ApiOperation({ summary: 'Change app settings (admin only)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updateAppConfig(@Body() dto: UpdateAppConfigDto) {
    return this.systemSettings.updateAppConfig(dto);
  }

  @Get('payment-qr')
  @ApiOperation({ summary: 'Get the global payment QR URL' })
  @ApiOkResponse({ description: 'Global payment QR URL' })
  async getPaymentQr() {
    return { paymentQrUrl: await this.systemSettings.getPaymentQrUrl() };
  }

  @Patch('payment-qr')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload or replace the global payment QR image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  updatePaymentQr(@UploadedFile() file: any) {
    return this.systemSettings.updatePaymentQr(file);
  }

  @Delete('payment-qr')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete the global payment QR image' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  deletePaymentQr() {
    return this.systemSettings.deletePaymentQr();
  }
}
