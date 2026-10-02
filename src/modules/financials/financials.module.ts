import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FinancialsService } from './services/financials.service';
import { CodeGroupsController } from './controllers/code-groups.controller';
import { CodesController } from './controllers/codes.controller';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { SubscriptionRequestsController } from './controllers/subscription-requests.controller';
import { UploadsModule } from '../uploads/uploads.module';
<<<<<<< HEAD

@Module({
  imports: [PrismaModule, UploadsModule],
=======
import { FirebaseModule } from '@/shared/firebase/firebase.module';

@Module({
  imports: [PrismaModule, UploadsModule, FirebaseModule],
>>>>>>> b003771b30409d560ff5f4883cf3637436ceb6ca
  providers: [FinancialsService],
  controllers: [CodeGroupsController, CodesController, SubscriptionsController, SubscriptionRequestsController],
  exports: [FinancialsService],
})
export class FinancialsModule {}
