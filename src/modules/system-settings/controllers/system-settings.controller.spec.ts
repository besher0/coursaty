import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from '../services/system-settings.service';

describe('SystemSettingsController payment QR permissions', () => {
  let app: INestApplication;
  let systemSettings: {
    getPaymentQrUrl: jest.Mock;
    updatePaymentQr: jest.Mock;
    deletePaymentQr: jest.Mock;
  };

  beforeEach(async () => {
    systemSettings = {
      getPaymentQrUrl: jest.fn().mockResolvedValue('https://cdn.example.com/uploads/payment-qr/system.webp'),
      updatePaymentQr: jest.fn().mockResolvedValue({ paymentQrUrl: 'https://cdn.example.com/uploads/payment-qr/new.webp' }),
      deletePaymentQr: jest.fn().mockResolvedValue({ paymentQrUrl: null }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [SystemSettingsController],
      providers: [{ provide: SystemSettingsService, useValue: systemSettings }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = {
            userId: 'user-1',
            type: req.headers['x-test-role'] === 'TEACHER' ? 'TEACHER' : 'ADMIN',
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows admin to upload the global QR', async () => {
    await request(app.getHttpServer())
      .patch('/system-settings/payment-qr')
      .set('x-test-role', 'ADMIN')
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'qr.png',
        contentType: 'image/png',
      })
      .expect(200);

    expect(systemSettings.updatePaymentQr).toHaveBeenCalledTimes(1);
  });

  it('blocks teacher from uploading the global QR', async () => {
    await request(app.getHttpServer())
      .patch('/system-settings/payment-qr')
      .set('x-test-role', 'TEACHER')
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'qr.png',
        contentType: 'image/png',
      })
      .expect(403);

    expect(systemSettings.updatePaymentQr).not.toHaveBeenCalled();
  });

  it('blocks teacher from deleting the global QR', async () => {
    await request(app.getHttpServer())
      .delete('/system-settings/payment-qr')
      .set('x-test-role', 'TEACHER')
      .expect(403);

    expect(systemSettings.deletePaymentQr).not.toHaveBeenCalled();
  });
});
