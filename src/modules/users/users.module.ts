import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { StudentsModule } from '@/modules/students/students.module';

@Module({
  imports: [PrismaModule, StudentsModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
