import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import {
  isStudentDeviceLockEnforced,
  normalizeLoginDeviceId,
  studentSessionDeviceMismatch,
} from '../student-device-lock';

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
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: {
        id: true,
        userableType: true,
        status: true,
        loginDeviceId: true,
      },
    });

    if (!user || user.status === 'deleted') {
      throw new UnauthorizedException('الحساب محذوف أو غير موجود');
    }

    // A student session is valid only on the account's bound device. Tokens
    // from before device binding (no `did`) or for another device end here.
    if (user.userableType === 'STUDENT' && isStudentDeviceLockEnforced(this.config)) {
      const tokenDeviceId = normalizeLoginDeviceId(payload?.did);
      if (!tokenDeviceId || tokenDeviceId !== user.loginDeviceId) {
        throw studentSessionDeviceMismatch();
      }
    }

    return { userId: user.id, type: user.userableType };
  }
}
