import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePointOfSaleDto } from '../dtos/create-point-of-sale.dto';
import { UpdatePointOfSaleDto } from '../dtos/update-point-of-sale.dto';

@Injectable()
export class PointOfSalesService {
  constructor(private prisma: PrismaService) {}

  async create(createPointOfSaleDto: CreatePointOfSaleDto) {
    const universityId = String(createPointOfSaleDto.universityId);
    const university = await this.prisma.university.findUnique({
      where: { id: universityId },
    });

    if (!university) {
      throw new NotFoundException('الجامعة غير موجودة');
    }

    return this.prisma.pointOfSale.create({
      data: {
        name: createPointOfSaleDto.name,
        address: createPointOfSaleDto.address,
        phone: createPointOfSaleDto.phone,
        description: createPointOfSaleDto.description,
        image: createPointOfSaleDto.image,
        imageLocation: createPointOfSaleDto.imageLocation,
        university: { connect: { id: universityId } },
        province: { connect: { id: university.provinceId } },
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
    return this.prisma.pointOfSale.findMany({
      where: { universityId },
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
    let student: { universityId: string; provinceId: string | null } | null = null;

    if (user?.type === 'STUDENT') {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: String(user.userId) },
      });
      if (!dbUser) throw new NotFoundException('المستخدم غير موجود');

      student = await this.prisma.student.findUnique({
        where: { id: dbUser.userableId },
        select: { universityId: true, provinceId: true },
      });
    }

    if (!student) {
      student = await this.prisma.student.findFirst({
        select: { universityId: true, provinceId: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!student) throw new NotFoundException('لا يوجد طالب متاح في النظام');

    if (student.provinceId) {
      return this.findByProvince(student.provinceId);
    }

    return this.findByUniversity(student.universityId);
  }

  async findOne(id: string) {
    return this.prisma.pointOfSale.findUnique({
      where: { id },
    });
  }

  async update(id: string, updatePointOfSaleDto: UpdatePointOfSaleDto) {
    let universityId: string | undefined;
    let provinceId: string | undefined;

    if (updatePointOfSaleDto.universityId !== undefined) {
      universityId = String(updatePointOfSaleDto.universityId);
      const university = await this.prisma.university.findUnique({
        where: { id: universityId },
      });

      if (!university) {
        throw new NotFoundException('الجامعة غير موجودة');
      }
      provinceId = university.provinceId;
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
        ...(universityId !== undefined ? { university: { connect: { id: universityId } } } : {}),
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

