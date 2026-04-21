import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { redisStore } from 'cache-manager-redis-store';
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
import { TeachersModule } from './modules/teachers/teachers.module';
import { PointOfSalesModule } from './modules/point-of-sales/point-of-sales.module';
import { AdvertisementsModule } from './modules/advertisements/advertisements.module';
import { AdminsModule } from './modules/admins/admins.module';
import { CustomerServiceModule } from './modules/customer-service/customer-service.module';
import { AppDescriptionModule } from './modules/app-description/app-description.module';
import { LoggerModule } from './shared/logger/logger.module';
import { CorrelationIdMiddleware } from './shared/logger/correlation-id.middleware';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';
import { UploadsModule } from './modules/uploads/uploads.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProvincesModule } from './modules/provinces/provinces.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        store: await redisStore({ url: 'redis://localhost:6379' }),
        ttl: 60,
      }),
    }),
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
    TeachersModule,
    AdminsModule,
    PointOfSalesModule,
    AdvertisementsModule,
    CustomerServiceModule,
    AppDescriptionModule,
    LoggerModule,
    UploadsModule,
    NotificationsModule,
    ProvincesModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
