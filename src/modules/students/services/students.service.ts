import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateStudentDto } from '../dtos/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStudentDto) {
    const university = await this.prisma.university.findUnique({
      where: { id: dto.universityId },
    });
    if (!university) throw new NotFoundException('University not found');

    const student = await this.prisma.student.create({
      data: {
        name: dto.name,
        universityNumber: dto.universityNumber,
        universityId: dto.universityId,
        provinceId: university.provinceId,
        collegeId: dto.collegeId,
        collegeYearId: dto.collegeYearId,
        departmentId: dto.departmentId ?? null,
      },
    });
    return student;
  }
}
