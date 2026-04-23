import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePointOfSaleDto } from '../dtos/create-point-of-sale.dto';
import { UpdatePointOfSaleDto } from '../dtos/update-point-of-sale.dto';

@Injectable()
export class PointOfSalesService {
  constructor(private prisma: PrismaService) {}

  async create(createPointOfSaleDto: CreatePointOfSaleDto) {
    const provinceId = String(createPointOfSaleDto.provinceId);
    const province = await this.prisma.province.findUnique({
      where: { id: provinceId },
    });

    if (!province) {
      throw new NotFoundException('المحافظة غير موجودة');
    }

    return this.prisma.pointOfSale.create({
      data: {
        name: createPointOfSaleDto.name,
        address: createPointOfSaleDto.address,
        phone: createPointOfSaleDto.phone,
        description: createPointOfSaleDto.description,
        image: createPointOfSaleDto.image,
        imageLocation: createPointOfSaleDto.imageLocation,
        province: { connect: { id: provinceId } },
      },
    });
  }

  async findAll() {
    return this.prisma.pointOfSale.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByUniversity(universityId: string) {
    const university = await this.prisma.university.findUnique({
      where: { id: String(universityId) },
      select: { provinceId: true },
    });

    if (!university) throw new NotFoundException('الجامعة غير موجودة');

    return this.prisma.pointOfSale.findMany({
      where: { provinceId: university.provinceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByProvince(provinceId: string) {
    return this.prisma.pointOfSale.findMany({
      where: { provinceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByStudentToken(user?: { userId: string | number; type: string }) {
    let student: { provinceId: string } | null = null;

    if (user?.type === 'STUDENT') {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: String(user.userId) },
      });
      if (!dbUser) throw new NotFoundException('المستخدم غير موجود');

      student = await this.prisma.student.findUnique({
        where: { id: dbUser.userableId },
        select: { provinceId: true },
      });
    }

    if (!student) {
      student = await this.prisma.student.findFirst({
        select: { provinceId: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!student) throw new NotFoundException('لا يوجد طالب متاح في النظام');

    return this.findByProvince(student.provinceId);
  }

  async findOne(id: string) {
    return this.prisma.pointOfSale.findUnique({
      where: { id },
    });
  }

  async update(id: string, updatePointOfSaleDto: UpdatePointOfSaleDto) {
    let provinceId: string | undefined;

    if (updatePointOfSaleDto.provinceId !== undefined) {
      provinceId = String(updatePointOfSaleDto.provinceId);
      const province = await this.prisma.province.findUnique({
        where: { id: provinceId },
      });

      if (!province) {
        throw new NotFoundException('المحافظة غير موجودة');
      }
    }

    return this.prisma.pointOfSale.update({
      where: { id },
      data: {
        name: updatePointOfSaleDto.name,
        address: updatePointOfSaleDto.address,
        phone: updatePointOfSaleDto.phone,
        description: updatePointOfSaleDto.description,
        image: updatePointOfSaleDto.image,
        imageLocation: updatePointOfSaleDto.imageLocation,
        ...(provinceId !== undefined ? { province: { connect: { id: provinceId } } } : {}),
      },
    });
  }

  async remove(id: string) {
    return this.prisma.pointOfSale.delete({
      where: { id },
    });
  }
}

