import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePointOfSaleDto } from '../dtos/create-point-of-sale.dto';
import { UpdatePointOfSaleDto } from '../dtos/update-point-of-sale.dto';

@Injectable()
export class PointOfSalesService {
  constructor(private prisma: PrismaService) {}

  async create(createPointOfSaleDto: CreatePointOfSaleDto) {
    const universityId = BigInt(createPointOfSaleDto.universityId);
    const university = await this.prisma.university.findUnique({
      where: { id: universityId },
    });

    if (!university) {
      throw new NotFoundException('University not found');
    }

    return this.prisma.pointOfSale.create({
      data: {
        name: createPointOfSaleDto.name,
        address: createPointOfSaleDto.address,
        image: createPointOfSaleDto.image,
        university: { connect: { id: universityId } },
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

  async findOne(id: bigint) {
    return this.prisma.pointOfSale.findUnique({
      where: { id },
    });
  }

  async update(id: bigint, updatePointOfSaleDto: UpdatePointOfSaleDto) {
    let universityId: bigint | undefined;

    if (updatePointOfSaleDto.universityId !== undefined) {
      universityId = BigInt(updatePointOfSaleDto.universityId);
      const university = await this.prisma.university.findUnique({
        where: { id: universityId },
      });

      if (!university) {
        throw new NotFoundException('University not found');
      }
    }

    return this.prisma.pointOfSale.update({
      where: { id },
      data: {
        name: updatePointOfSaleDto.name,
        address: updatePointOfSaleDto.address,
        image: updatePointOfSaleDto.image,
        ...(universityId !== undefined ? { university: { connect: { id: universityId } } } : {}),
      },
    });
  }

  async remove(id: bigint) {
    return this.prisma.pointOfSale.delete({
      where: { id },
    });
  }
}
