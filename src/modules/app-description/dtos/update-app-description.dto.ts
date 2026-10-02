import { PartialType } from '@nestjs/swagger';
import { CreateAppDescriptionDto } from './create-app-description.dto';

export class UpdateAppDescriptionDto extends PartialType(CreateAppDescriptionDto) {}
