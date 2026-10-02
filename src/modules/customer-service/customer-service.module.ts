import { Module } from '@nestjs/common';
import { CustomerServiceController } from './controllers/customer-service.controller';
import { CustomerServiceService } from './services/customer-service.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CustomerServiceController],
  providers: [CustomerServiceService],
  exports: [CustomerServiceService],
})
export class CustomerServiceModule {}
