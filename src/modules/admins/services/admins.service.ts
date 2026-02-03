import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAdminDto } from '../dtos/create-admin.dto';

@Injectable()
export class AdminsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAdminDto) {
    return this.prisma.admin.create({
      data: {
        name: dto.name,
      },
    });
  }

  async list() {
    return this.prisma.admin.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
