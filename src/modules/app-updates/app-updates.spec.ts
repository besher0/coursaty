import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AppUpdatesController } from './app-updates.controller';
import { AppUpdatesService } from './app-updates.service';

describe('app updates', () => {
  function serviceWith(policy: Record<string, unknown> | null) {
    const prisma = {
      appReleasePolicy: {
        findUnique: jest.fn().mockResolvedValue(policy),
        upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
      },
    } as any;
    return { service: new AppUpdatesService(prisma), prisma };
  }

  const policy = {
    platform: 'android',
    latestVersion: '2.1.1',
    latestBuild: 7,
    mode: 'FLEXIBLE',
    storeUrl: 'https://play.google.com/store/apps/details?id=com.YamanKartal.coursaty_app',
    downloadUrl: 'https://example.com/coursaty.apk',
    message: 'تحسينات',
  };

  it('offers a flexible update to an older build', async () => {
    const { service } = serviceWith(policy);
    await expect(service.check('android', 6)).resolves.toMatchObject({
      updateAvailable: true,
      required: false,
      latestVersion: '2.1.1',
      downloadUrl: 'https://example.com/coursaty.apk',
    });
  });

  it('requires a forced update', async () => {
    const { service } = serviceWith({ ...policy, mode: 'FORCE' });
    await expect(service.check('android', 6)).resolves.toMatchObject({
      updateAvailable: true,
      required: true,
    });
  });

  it('says nothing to an up-to-date or newer build, or when no policy is set', async () => {
    const { service } = serviceWith({ ...policy, mode: 'FORCE' });
    await expect(service.check('android', 7)).resolves.toMatchObject({
      updateAvailable: false,
      required: false,
    });
    await expect(service.check('android', 8)).resolves.toMatchObject({ required: false });

    const empty = serviceWith(null).service;
    await expect(empty.check('ios', 1)).resolves.toMatchObject({
      updateAvailable: false,
      required: false,
      latestBuild: null,
    });
  });

  it('stores blank links as empty', async () => {
    const { service, prisma } = serviceWith(null);
    await service.upsert('android', {
      latestVersion: '2.1.1',
      latestBuild: 7,
      mode: 'FORCE',
      storeUrl: '  ',
      downloadUrl: undefined,
      message: '',
    });
    expect(prisma.appReleasePolicy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform: 'android' },
        update: expect.objectContaining({ storeUrl: null, downloadUrl: null, message: null }),
      }),
    );
  });

  it('only admins list and change the policy; the check is public', () => {
    for (const handler of [AppUpdatesController.prototype.list, AppUpdatesController.prototype.upsert]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([JwtAuthGuard, RolesGuard]);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['ADMIN']);
    }
    expect(Reflect.getMetadata(GUARDS_METADATA, AppUpdatesController.prototype.check)).toBeUndefined();
  });
});
