import { Module } from '@nestjs/common';
import { AdvertisementsService } from './services/advertisements.service';
import { AdvertisementsController } from './controllers/advertisements.controller';

@Module({
  controllers: [AdvertisementsController],
  providers: [AdvertisementsService],
})
export class AdvertisementsModule {}
