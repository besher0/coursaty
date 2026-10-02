import { SystemSettingsService } from './system-settings.service';

describe('SystemSettingsService payment QR', () => {
  function createService() {
    const prisma: any = {
      systemSettings: {
        upsert: jest.fn().mockResolvedValue({
          id: 1,
          paymentQrUrl: 'https://cdn.example.com/uploads/payment-qr/old.webp',
        }),
        update: jest.fn().mockResolvedValue({
          id: 1,
          paymentQrUrl: 'https://cdn.example.com/uploads/payment-qr/new.webp',
        }),
      },
    };
    const uploads = {
      uploadPaymentQr: jest.fn().mockResolvedValue({
        fileUrl: 'https://cdn.example.com/uploads/payment-qr/new.webp',
        storagePath: 'uploads/payment-qr/new.webp',
      }),
      deletePaymentQr: jest.fn().mockResolvedValue(undefined),
    };

    return {
      prisma,
      uploads,
      service: new SystemSettingsService(prisma, uploads as any),
    };
  }

  it('creates the singleton settings row when reading settings', async () => {
    const { service, prisma } = createService();

    await service.getSettings();

    expect(prisma.systemSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
  });

  it('uploads the new QR, updates settings, then deletes the old QR', async () => {
    const { service, prisma, uploads } = createService();

    await expect(service.updatePaymentQr({ buffer: Buffer.from('png') })).resolves.toEqual({
      paymentQrUrl: 'https://cdn.example.com/uploads/payment-qr/new.webp',
    });

    expect(uploads.uploadPaymentQr).toHaveBeenCalledTimes(1);
    expect(prisma.systemSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { paymentQrUrl: 'https://cdn.example.com/uploads/payment-qr/new.webp' },
    });
    expect(uploads.deletePaymentQr).toHaveBeenCalledWith('uploads/payment-qr/old.webp');
  });

  it('cleans up the newly uploaded QR if the database update fails', async () => {
    const { service, prisma, uploads } = createService();
    const dbError = new Error('db failed');
    prisma.systemSettings.update.mockRejectedValueOnce(dbError);

    await expect(service.updatePaymentQr({ buffer: Buffer.from('png') })).rejects.toBe(dbError);

    expect(uploads.deletePaymentQr).toHaveBeenCalledWith('uploads/payment-qr/new.webp');
  });

  it('deletes the global QR by nulling settings and cleaning old storage', async () => {
    const { service, prisma, uploads } = createService();
    prisma.systemSettings.update.mockResolvedValueOnce({ id: 1, paymentQrUrl: null });

    await expect(service.deletePaymentQr()).resolves.toEqual({ paymentQrUrl: null });

    expect(prisma.systemSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { paymentQrUrl: null },
    });
    expect(uploads.deletePaymentQr).toHaveBeenCalledWith('uploads/payment-qr/old.webp');
  });
});
