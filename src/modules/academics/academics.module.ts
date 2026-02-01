import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UniversitiesController } from './controllers/universities.controller';
import { CollegesController } from './controllers/colleges.controller';
import { DepartmentsController } from './controllers/departments.controller';
import { SubjectsController } from './controllers/subjects.controller';
import { YearsController } from './controllers/years.controller';
import { SeasonsController } from './controllers/seasons.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { AcademicsService } from './services/academics.service';
import { DashboardService } from './services/dashboard.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    UniversitiesController,
    CollegesController,
    DepartmentsController,
    SubjectsController,
    YearsController,
    SeasonsController,
    DashboardController,
  ],
  providers: [AcademicsService, DashboardService],
  exports: [AcademicsService, DashboardService],
})
export class AcademicsModule {}
