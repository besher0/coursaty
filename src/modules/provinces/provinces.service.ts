import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateProvinceDto } from './dtos/create-province.dto';
import { UpdateProvinceDto } from './dtos/update-province.dto';

@Injectable()
export class ProvincesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProvinceDto) {
    return this.prisma.province.create({ data: { name: dto.name } });
  }

  findAll() {
    return this.prisma.province.findMany({ orderBy: { name: 'asc' } });
  }

  async update(id: string, dto: UpdateProvinceDto) {
    const existing = await this.prisma.province.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المحافظة غير موجودة');
    return this.prisma.province.update({ where: { id }, data: { name: dto.name } });
  }

  async remove(id: string) {
    const existing = await this.prisma.province.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('المحافظة غير موجودة');
    return this.prisma.province.delete({ where: { id } });
  }
}

