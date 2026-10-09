import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import {
  isStudentDeviceLockEnforced,
  LOGIN_DEVICE_HEADER,
  normalizeLoginDeviceId,
  studentSessionDeviceMismatch,
} from '../student-device-lock';

type StudentSessionUser = {
  id: string;
  loginDeviceId: string | null;
  loginDeviceResetAt: Date | null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: {
        id: true,
        userableType: true,
        status: true,
        loginDeviceId: true,
        loginDeviceResetAt: true,
      },
    });

    if (!user || user.status === 'deleted') {
      throw new UnauthorizedException('الحساب محذوف أو غير موجود');
    }

    if (user.userableType === 'STUDENT' && isStudentDeviceLockEnforced(this.config)) {
      await this.assertStudentDevice(user, req, payload);
    }

    return { userId: user.id, type: user.userableType };
  }

  /**
   * A student session works only on the account's bound device:
   * - tokens from login carry the device (`did`), which must be the bound one;
   * - sessions from before device binding carry none: the first device that
   *   uses one (the app's device header) becomes the bound device, so a student
   *   who updates the app stays signed in on that phone;
   * - tokens issued before an admin reset of the binding are void.
   */
  private async assertStudentDevice(
    user: StudentSessionUser,
    req: Request,
    payload: any,
  ) {
    if (user.loginDeviceResetAt) {
      const issuedAt = Number(payload?.iat);
      const resetAt = Math.floor(user.loginDeviceResetAt.getTime() / 1000);
      if (!Number.isFinite(issuedAt) || issuedAt < resetAt) {
        throw studentSessionDeviceMismatch();
      }
    }

    const tokenDeviceId = normalizeLoginDeviceId(payload?.did);
    const requestDeviceId = normalizeLoginDeviceId(
      req?.headers?.[LOGIN_DEVICE_HEADER],
    );

    if (tokenDeviceId) {
      if (
        tokenDeviceId !== user.loginDeviceId ||
        (requestDeviceId && requestDeviceId !== tokenDeviceId)
      ) {
        throw studentSessionDeviceMismatch();
      }
      return;
    }

    if (!requestDeviceId) throw studentSessionDeviceMismatch();
    if (user.loginDeviceId) {
      if (requestDeviceId !== user.loginDeviceId) {
        throw studentSessionDeviceMismatch();
      }
      return;
    }

    const claimed = await this.prisma.user.updateMany({
      where: { id: user.id, loginDeviceId: null },
      data: { loginDeviceId: requestDeviceId, loginDeviceBoundAt: new Date() },
    });
    if (claimed.count === 1) return;
    // Another device bound the account at the same moment.
    const current = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { loginDeviceId: true },
    });
    if (current?.loginDeviceId !== requestDeviceId) {
      throw studentSessionDeviceMismatch();
    }
  }
}
