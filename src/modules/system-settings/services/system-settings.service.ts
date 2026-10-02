import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UploadsService } from '@/modules/uploads/uploads.service';

@Injectable()
export class SystemSettingsService {
  private static readonly SETTINGS_ID = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  async getSettings() {
    return this.prisma.systemSettings.upsert({
      where: { id: SystemSettingsService.SETTINGS_ID },
      update: {},
      create: { id: SystemSettingsService.SETTINGS_ID },
    });
  }

  async getPaymentQrUrl(): Promise<string | null> {
    const settings = await this.getSettings();
    return settings.paymentQrUrl ?? null;
  }

  async updatePaymentQr(file: any) {
    const previousSettings = await this.getSettings();
    const uploaded = await this.uploads.uploadPaymentQr(file);

    let settings: { paymentQrUrl: string | null };
    try {
      settings = await this.prisma.systemSettings.update({
        where: { id: SystemSettingsService.SETTINGS_ID },
        data: { paymentQrUrl: uploaded.fileUrl },
      });
    } catch (error) {
      await this.uploads.deletePaymentQr(uploaded.storagePath);
      throw error;
    }

    await this.deletePaymentQrUrl(previousSettings.paymentQrUrl);

    return { paymentQrUrl: settings.paymentQrUrl ?? null };
  }

  async deletePaymentQr() {
    const previousSettings = await this.getSettings();

    await this.prisma.systemSettings.update({
      where: { id: SystemSettingsService.SETTINGS_ID },
      data: { paymentQrUrl: null },
    });

    await this.deletePaymentQrUrl(previousSettings.paymentQrUrl);

    return { paymentQrUrl: null };
  }

  private async deletePaymentQrUrl(paymentQrUrl?: string | null) {
    const storagePath = this.extractPaymentQrStoragePath(paymentQrUrl);
    if (!storagePath) return;
    await this.uploads.deletePaymentQr(storagePath);
  }

  private extractPaymentQrStoragePath(paymentQrUrl?: string | null) {
    if (!paymentQrUrl) return null;
    try {
      const pathname = new URL(paymentQrUrl).pathname.replace(/^\/+/, '');
      return pathname.startsWith('uploads/payment-qr/') ? pathname : null;
    } catch {
      return null;
    }
  }
}
