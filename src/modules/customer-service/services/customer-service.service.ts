import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateCustomerServiceDto } from '../dtos/create-customer-service.dto';
import { UpdateCustomerServiceDto } from '../dtos/update-customer-service.dto';
import { CustomerServiceEntity } from '@/domain/customer-service/entities/customer-service.entity';
import { CustomerServiceMapper } from '@/domain/customer-service/mappers/customer-service.mapper';
import { CustomerServiceNotFoundError } from '@/domain/customer-service/errors/customer-service.errors';

@Injectable()
export class CustomerServiceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerServiceDto) {
    const entity = CustomerServiceEntity.create({
      technicalSupportPhone: dto.technicalSupportPhone,
      contactSupportPhone: dto.contactSupportPhone,
      whatsappUrl: dto.whatsappUrl,
      telegramUrl: dto.telegramUrl,
      facebookUrl: dto.facebookUrl,
      instagramUrl: dto.instagramUrl,
    });

    return this.prisma.customerService.create({
      data: CustomerServiceMapper.toPersistenceCreate(entity),
    });
  }

  async findAll() {
    return this.prisma.customerService.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const service = await this.prisma.customerService.findUnique({
      where: { id: String(id) },
    });
    if (!service) throw new CustomerServiceNotFoundError();
    return service;
  }

  async update(id: number, dto: UpdateCustomerServiceDto) {
    const existing = await this.findOne(id);
    const entity = CustomerServiceMapper.toDomain(existing);
    entity.update(dto);

    return this.prisma.customerService.update({
      where: { id: String(id) },
      data: CustomerServiceMapper.toPersistenceUpdate(entity),
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.customerService.delete({
      where: { id: String(id) },
    });
  }
}
