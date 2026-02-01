import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateStudentDto } from '../dtos/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStudentDto) {
    const student = await this.prisma.student.create({
      data: {
        name: dto.name,
        universityNumber: dto.universityNumber,
        gender: dto.gender,
        universityId: BigInt(dto.universityId),
        collegeId: BigInt(dto.collegeId),
        departmentId: BigInt(dto.departmentId),
        yearId: BigInt(dto.yearId),
      },
    });
    return student;
  }
}
