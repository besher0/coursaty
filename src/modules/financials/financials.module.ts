import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialsService } from './services/financials.service';
import { CodeGroupsController } from './controllers/code-groups.controller';
import { CodesController } from './controllers/codes.controller';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { SubscriptionRequestsController } from './controllers/subscription-requests.controller';
import { UploadsModule } from '../uploads/uploads.module';
import { FirebaseModule } from '@/shared/firebase/firebase.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [PrismaModule, UploadsModule, FirebaseModule, SystemSettingsModule],
  providers: [FinancialsService],
  controllers: [CodeGroupsController, CodesController, SubscriptionsController, SubscriptionRequestsController],
  exports: [FinancialsService],
})
export class FinancialsModule {}
