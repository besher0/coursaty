import { PhoneNumber } from '../value-objects/phone-number.vo';
import { SocialLink } from '../value-objects/social-link.vo';

export interface CustomerServiceProps {
  id?: bigint;
  technicalSupportPhone: string;
  contactSupportPhone: string;
  whatsappUrl?: string | null;
  telegramUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CustomerServiceEntity {
  private constructor(private props: CustomerServiceProps) {}

  static create(props: CustomerServiceProps): CustomerServiceEntity {
    const technicalSupportPhone = PhoneNumber.create(props.technicalSupportPhone).getValue();
    const contactSupportPhone = PhoneNumber.create(props.contactSupportPhone).getValue();

    const whatsappUrl = props.whatsappUrl ? SocialLink.create(props.whatsappUrl).getValue() : null;
    const telegramUrl = props.telegramUrl ? SocialLink.create(props.telegramUrl).getValue() : null;
    const facebookUrl = props.facebookUrl ? SocialLink.create(props.facebookUrl).getValue() : null;
    const instagramUrl = props.instagramUrl ? SocialLink.create(props.instagramUrl).getValue() : null;

    return new CustomerServiceEntity({
      ...props,
      technicalSupportPhone,
      contactSupportPhone,
      whatsappUrl,
      telegramUrl,
      facebookUrl,
      instagramUrl,
    });
  }

  update(partial: Partial<CustomerServiceProps>) {
    const next: CustomerServiceProps = {
      ...this.props,
      ...partial,
    };

    const technicalSupportPhone = PhoneNumber.create(next.technicalSupportPhone).getValue();
    const contactSupportPhone = PhoneNumber.create(next.contactSupportPhone).getValue();

    const whatsappUrl = next.whatsappUrl ? SocialLink.create(next.whatsappUrl).getValue() : null;
    const telegramUrl = next.telegramUrl ? SocialLink.create(next.telegramUrl).getValue() : null;
    const facebookUrl = next.facebookUrl ? SocialLink.create(next.facebookUrl).getValue() : null;
    const instagramUrl = next.instagramUrl ? SocialLink.create(next.instagramUrl).getValue() : null;

    this.props = {
      ...next,
      technicalSupportPhone,
      contactSupportPhone,
      whatsappUrl,
      telegramUrl,
      facebookUrl,
      instagramUrl,
    };
  }

  getProps(): CustomerServiceProps {
    return { ...this.props };
  }
}
