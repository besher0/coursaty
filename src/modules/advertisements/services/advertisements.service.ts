import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAdvertisementDto } from '../dtos/create-advertisement.dto';
import { UpdateAdvertisementDto } from '../dtos/update-advertisement.dto';

@Injectable()
export class AdvertisementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAdvertisementDto) {
    const college = await this.prisma.college.findUnique({ where: { id: BigInt(dto.collegeId) } });
    if (!college) throw new NotFoundException('College not found');

    return this.prisma.advertisement.create({
      data: {
        collegeId: BigInt(dto.collegeId),
        title: dto.title,
        imageUrl: dto.imageUrl,
      },
    });
  }

  findAll() {
    return this.prisma.advertisement.findMany({
      include: { college: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByCollege(collegeId: number) {
    return this.prisma.advertisement.findMany({
      where: { collegeId: BigInt(collegeId) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const ad = await this.prisma.advertisement.findUnique({
      where: { id: BigInt(id) },
      include: { college: true },
    });
    if (!ad) throw new NotFoundException('Advertisement not found');
    return ad;
  }

  async update(id: number, dto: UpdateAdvertisementDto) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id: BigInt(id) } });
    if (!ad) throw new NotFoundException('Advertisement not found');

    if (dto.collegeId) {
      const college = await this.prisma.college.findUnique({ where: { id: BigInt(dto.collegeId) } });
      if (!college) throw new BadRequestException('College not found');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.collegeId !== undefined) data.collegeId = BigInt(dto.collegeId);

    return this.prisma.advertisement.update({
      where: { id: BigInt(id) },
      data,
      include: { college: true },
    });
  }

  async remove(id: number) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id: BigInt(id) } });
    if (!ad) throw new NotFoundException('Advertisement not found');

    return this.prisma.advertisement.delete({
      where: { id: BigInt(id) },
    });
  }
}
