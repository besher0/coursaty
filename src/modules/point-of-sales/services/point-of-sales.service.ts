import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePointOfSaleDto } from '../dtos/create-point-of-sale.dto';
import { UpdatePointOfSaleDto } from '../dtos/update-point-of-sale.dto';

@Injectable()
export class PointOfSalesService {
  constructor(private prisma: PrismaService) {}

  private pointOfSaleInclude = {
    province: {
      select: {
        id: true,
        name: true,
        universities: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
  } as const;

  private collectMissingFields(pointOfSale: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    description?: string | null;
    image?: string | null;
    imageLocation?: string | null;
    provinceId?: string | null;
    province?: { universities?: Array<{ id: string }> } | null;
  }) {
    const missingFields: string[] = [];

    if (!pointOfSale.name?.trim()) missingFields.push('name');
    if (!pointOfSale.address?.trim()) missingFields.push('address');
    if (!pointOfSale.phone?.trim()) missingFields.push('phone');
    if (!pointOfSale.description?.trim()) missingFields.push('description');
    if (!pointOfSale.image?.trim()) missingFields.push('image');
    if (!pointOfSale.imageLocation?.trim()) missingFields.push('imageLocation');
    if (!pointOfSale.provinceId) missingFields.push('provinceId');
    if (!pointOfSale.province?.universities?.length) {
      missingFields.push('provinceUniversityId');
    }

    return missingFields;
  }

  private mapPointOfSaleWithProvinceInfo(pointOfSale: any) {
    const universityIds = (pointOfSale.province?.universities ?? []).map((u: any) => u.id);
    const missingFields = this.collectMissingFields(pointOfSale);

    return {
      ...pointOfSale,
      provinceUniversityId: universityIds[0] ?? null,
      provinceUniversityIds: universityIds,
      missingFields,
      isComplete: missingFields.length === 0,
    };
  }

  private async resolveProvinceIdFromUniversity(universityId: string) {
    const university = await this.prisma.university.findUnique({
      where: { id: String(universityId) },
      select: { provinceId: true },
    });

    if (!university) throw new NotFoundException('الجامعة غير موجودة');
    return university.provinceId;
  }

  async create(createPointOfSaleDto: CreatePointOfSaleDto) {
    const provinceId = String(createPointOfSaleDto.provinceId);
    const province = await this.prisma.province.findUnique({
      where: { id: provinceId },
    });

    if (!province) {
      throw new NotFoundException('المحافظة غير موجودة');
    }

    const created = await this.prisma.pointOfSale.create({
      data: {
        name: createPointOfSaleDto.name,
        address: createPointOfSaleDto.address,
        phone: createPointOfSaleDto.phone,
        description: createPointOfSaleDto.description,
        image: createPointOfSaleDto.image,
        imageLocation: createPointOfSaleDto.imageLocation,
        province: { connect: { id: provinceId } },
      },
      include: this.pointOfSaleInclude,
    });

    return this.mapPointOfSaleWithProvinceInfo(created);
  }

  async findAll(filters?: { universityId?: string; provinceId?: string }) {
    let provinceId = filters?.provinceId ? String(filters.provinceId) : undefined;

    if (filters?.universityId) {
      provinceId = await this.resolveProvinceIdFromUniversity(String(filters.universityId));
    }

    const pointOfSales = await this.prisma.pointOfSale.findMany({
      where: provinceId ? { provinceId } : undefined,
      include: this.pointOfSaleInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return pointOfSales.map((pointOfSale) => this.mapPointOfSaleWithProvinceInfo(pointOfSale));
  }

  async findByUniversity(universityId: string) {
    const provinceId = await this.resolveProvinceIdFromUniversity(universityId);

    const pointOfSales = await this.prisma.pointOfSale.findMany({
      where: { provinceId },
      include: this.pointOfSaleInclude,
      orderBy: { createdAt: 'desc' },
    });

    return pointOfSales.map((pointOfSale) => this.mapPointOfSaleWithProvinceInfo(pointOfSale));
  }

  async findByProvince(provinceId: string) {
    const pointOfSales = await this.prisma.pointOfSale.findMany({
      where: { provinceId },
      include: this.pointOfSaleInclude,
      orderBy: { createdAt: 'desc' },
    });

    return pointOfSales.map((pointOfSale) => this.mapPointOfSaleWithProvinceInfo(pointOfSale));
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
    const pointOfSale = await this.prisma.pointOfSale.findUnique({
      where: { id },
      include: this.pointOfSaleInclude,
    });

    if (!pointOfSale) return null;

    return this.mapPointOfSaleWithProvinceInfo(pointOfSale);
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

    const updated = await this.prisma.pointOfSale.update({
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
      include: this.pointOfSaleInclude,
    });

    return this.mapPointOfSaleWithProvinceInfo(updated);
  }

  async remove(id: string) {
    return this.prisma.pointOfSale.delete({
      where: { id },
    });
  }
}

