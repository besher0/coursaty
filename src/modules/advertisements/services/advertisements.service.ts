import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAdvertisementDto } from '../dtos/create-advertisement.dto';
import { UpdateAdvertisementDto } from '../dtos/update-advertisement.dto';

@Injectable()
export class AdvertisementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAdvertisementDto) {
    const college = await this.prisma.college.findUnique({ where: { id: String(dto.collegeId) } });
    if (!college) throw new NotFoundException('الكلية غير موجودة');

    return this.prisma.advertisement.create({
      data: {
        collegeId: String(dto.collegeId),
        title: dto.title,
        imageUrl: dto.imageUrl,
        helperLink: dto.helperLink,
      },
    });
  }

  findAll() {
    return this.prisma.advertisement.findMany({
      include: { college: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByCollege(collegeId: string) {
    return this.prisma.advertisement.findMany({
      where: { collegeId: String(collegeId) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const ad = await this.prisma.advertisement.findUnique({
      where: { id: String(id) },
      include: { college: true },
    });
    if (!ad) throw new NotFoundException('الإعلان غير موجود');
    return ad;
  }

  async update(id: string, dto: UpdateAdvertisementDto) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id: String(id) } });
    if (!ad) throw new NotFoundException('الإعلان غير موجود');

    if (dto.collegeId) {
      const college = await this.prisma.college.findUnique({ where: { id: String(dto.collegeId) } });
      if (!college) throw new BadRequestException('الكلية غير موجودة');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.helperLink !== undefined) data.helperLink = dto.helperLink || null;
    if (dto.collegeId !== undefined) data.collegeId = String(dto.collegeId);

    return this.prisma.advertisement.update({
      where: { id: String(id) },
      data,
      include: { college: true },
    });
  }

  async remove(id: string) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id: String(id) } });
    if (!ad) throw new NotFoundException('الإعلان غير موجود');

    return this.prisma.advertisement.delete({
      where: { id: String(id) },
    });
  }
}

