import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { ROLES_KEY } from '@/modules/auth/roles.decorator';
import { SystemSettingsController } from './controllers/system-settings.controller';
import { SystemSettingsService } from './services/system-settings.service';

describe('iPhone paid-content setting', () => {
  function service(visible = false) {
    const prisma = {
      systemSettings: {
        upsert: jest.fn().mockResolvedValue({ id: 1, iosPaidContentVisible: visible }),
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
      },
    } as any;
    return { prisma, service: new SystemSettingsService(prisma, {} as any) };
  }

  it('is hidden until an admin shows it', async () => {
    await expect(service().service.getAppConfig()).resolves.toEqual({
      iosPaidContentVisible: false,
    });
  });

  it('stores the admin choice', async () => {
    const { service: s, prisma } = service();
    await expect(s.updateAppConfig({ iosPaidContentVisible: true })).resolves.toEqual({
      iosPaidContentVisible: true,
    });
    expect(prisma.systemSettings.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { iosPaidContentVisible: true },
    });
  });

  it('anyone reads it, only admins change it', () => {
    const proto = SystemSettingsController.prototype;
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.getAppConfig)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, proto.updateAppConfig)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, proto.updateAppConfig)).toEqual(['ADMIN']);
  });
});
