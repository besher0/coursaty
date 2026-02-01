import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateTeacherDto } from '../dtos/create-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTeacherDto) {
    const teacher = await this.prisma.teacher.create({
      data: {
        name: dto.name,
        description: dto.description,
        image: dto.image,
        teacherPercentage: dto.teacherPercentage ?? 0,
      },
    });
    return teacher;
  }
}
