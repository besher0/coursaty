import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AppPlatform, UpsertAppReleasePolicyDto } from './dtos/app-update.dto';

export interface AppUpdateCheck {
  platform: AppPlatform;
  /** A newer build than the installed one exists. */
  updateAvailable: boolean;
  /** The app must not be used until it is updated (mode FORCE). */
  required: boolean;
  latestVersion: string | null;
  latestBuild: number | null;
  mode: 'FLEXIBLE' | 'FORCE' | null;
  storeUrl: string | null;
  downloadUrl: string | null;
  message: string | null;
}

/**
 * The newest app release per platform and whether installing it is required,
 * as set by an admin. Apps check here instead of asking the store, which is
 * slow to report new versions and knows nothing about installs from outside
 * it.
 */
@Injectable()
export class AppUpdatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.appReleasePolicy.findMany({ orderBy: { platform: 'asc' } });
  }

  upsert(platform: AppPlatform, dto: UpsertAppReleasePolicyDto) {
    const data = {
      latestVersion: dto.latestVersion,
      latestBuild: dto.latestBuild,
      mode: dto.mode,
      storeUrl: dto.storeUrl?.trim() || null,
      downloadUrl: dto.downloadUrl?.trim() || null,
      message: dto.message?.trim() || null,
    };
    return this.prisma.appReleasePolicy.upsert({
      where: { platform },
      create: { platform, ...data },
      update: data,
    });
  }

  async check(platform: AppPlatform, installedBuild: number): Promise<AppUpdateCheck> {
    const policy = await this.prisma.appReleasePolicy.findUnique({ where: { platform } });
    const updateAvailable = !!policy && installedBuild < policy.latestBuild;
    return {
      platform,
      updateAvailable,
      required: updateAvailable && policy?.mode === 'FORCE',
      latestVersion: policy?.latestVersion ?? null,
      latestBuild: policy?.latestBuild ?? null,
      mode: (policy?.mode as AppUpdateCheck['mode']) ?? null,
      storeUrl: policy?.storeUrl ?? null,
      downloadUrl: policy?.downloadUrl ?? null,
      message: policy?.message ?? null,
    };
  }
}
