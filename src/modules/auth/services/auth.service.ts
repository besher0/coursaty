import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async register(dto: RegisterDto) {
    const hash = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          password: hash,
          userableId: BigInt(dto.userableId),
          userableType: dto.userableType,
          fcmToken: dto.fcmToken,
        },
      });
      return {
        ...user,
        id: user.id.toString(),
        userableId: user.userableId.toString(),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique constraint violation (e.g., phone already taken)
        throw new ConflictException('Phone is already registered');
      }
      throw err;
    }
  }

  async validateUser(phone: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.phone, dto.password);
    const payload = { sub: user.id.toString(), type: user.userableType };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      user: {
        ...user,
        id: user.id.toString(),
        userableId: user.userableId.toString(),
      },
    };
  }
}
