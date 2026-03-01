import { CustomerService, Prisma } from '@prisma/client';
import { CustomerServiceEntity, CustomerServiceProps } from '../entities/customer-service.entity';

export class CustomerServiceMapper {
  static toDomain(persistence: CustomerService): CustomerServiceEntity {
    return CustomerServiceEntity.create({
      id: persistence.id,
      technicalSupportPhone: persistence.technicalSupportPhone,
      contactSupportPhone: persistence.contactSupportPhone,
      whatsappUrl: persistence.whatsappUrl,
      telegramUrl: persistence.telegramUrl,
      facebookUrl: persistence.facebookUrl,
      instagramUrl: persistence.instagramUrl,
      createdAt: persistence.createdAt,
      updatedAt: persistence.updatedAt,
    });
  }

  static toPersistence(entity: CustomerServiceEntity): CustomerServiceProps {
    return entity.getProps();
  }

  static toPersistenceCreate(
    entity: CustomerServiceEntity,
  ): Prisma.CustomerServiceUncheckedCreateInput {
    const props = entity.getProps();
    return {
      technicalSupportPhone: props.technicalSupportPhone,
      contactSupportPhone: props.contactSupportPhone,
      whatsappUrl: props.whatsappUrl ?? undefined,
      telegramUrl: props.telegramUrl ?? undefined,
      facebookUrl: props.facebookUrl ?? undefined,
      instagramUrl: props.instagramUrl ?? undefined,
    };
  }

  static toPersistenceUpdate(
    entity: CustomerServiceEntity,
  ): Prisma.CustomerServiceUncheckedUpdateInput {
    const props = entity.getProps();
    return {
      technicalSupportPhone: props.technicalSupportPhone,
      contactSupportPhone: props.contactSupportPhone,
      whatsappUrl: props.whatsappUrl ?? null,
      telegramUrl: props.telegramUrl ?? null,
      facebookUrl: props.facebookUrl ?? null,
      instagramUrl: props.instagramUrl ?? null,
    };
  }
}
