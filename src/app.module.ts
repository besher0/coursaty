import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CourseModule } from './modules/courses/course.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AcademicsModule } from './modules/academics/academics.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { FinancialsModule } from './modules/financials/financials.module';
import { LecturesModule } from './modules/lectures/lectures.module';
import { BunnyModule } from './shared/bunny/bunny.module';
import { FirebaseModule } from './shared/firebase/firebase.module';
import { StudentsModule } from './modules/students/students.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { PointOfSalesModule } from './modules/point-of-sales/point-of-sales.module';
import { AdvertisementsModule } from './modules/advertisements/advertisements.module';
import { AdminsModule } from './modules/admins/admins.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    BunnyModule,
    FirebaseModule,
    CourseModule,
    AuthModule,
    UsersModule,
    AcademicsModule,
    InteractionsModule,
    FinancialsModule,
    LecturesModule,
    StudentsModule,
    TeachersModule,
    AdminsModule,
    PointOfSalesModule,
    AdvertisementsModule,
  ],
})
export class AppModule {}
