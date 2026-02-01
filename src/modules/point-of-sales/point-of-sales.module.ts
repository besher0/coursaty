import { Module } from '@nestjs/common';
import { PointOfSalesService } from './services/point-of-sales.service';
import { PointOfSalesController } from './controllers/point-of-sales.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PointOfSalesController],
  providers: [PointOfSalesService],
})
export class PointOfSalesModule {}
