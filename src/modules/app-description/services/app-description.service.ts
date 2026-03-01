import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAppDescriptionDto } from '../dtos/create-app-description.dto';
import { UpdateAppDescriptionDto } from '../dtos/update-app-description.dto';

@Injectable()
export class AppDescriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAppDescriptionDto) {
    return this.prisma.appDescription.create({
      data: {
        title: dto.title,
        description: dto.description,
      },
    });
  }

  async findAll() {
    return this.prisma.appDescription.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const description = await this.prisma.appDescription.findUnique({
      where: { id: BigInt(id) },
    });
    if (!description) throw new NotFoundException('App description not found');
    return description;
  }

  async update(id: number, dto: UpdateAppDescriptionDto) {
    await this.findOne(id);
    return this.prisma.appDescription.update({
      where: { id: BigInt(id) },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.appDescription.delete({
      where: { id: BigInt(id) },
    });
  }
}
