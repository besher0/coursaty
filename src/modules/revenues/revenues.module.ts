import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { RevenueService } from './services/revenue.service';

@Module({
  imports: [PrismaModule],
  providers: [RevenueService],
  exports: [RevenueService],
})
export class RevenuesModule {}
