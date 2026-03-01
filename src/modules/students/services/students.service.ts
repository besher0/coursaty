import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateStudentDto } from '../dtos/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStudentDto) {
    const university = await this.prisma.university.findUnique({
      where: { id: BigInt(dto.universityId) },
    });
    if (!university) throw new NotFoundException('University not found');

    const student = await this.prisma.student.create({
      data: {
        name: dto.name,
        universityNumber: dto.universityNumber,
        universityId: BigInt(dto.universityId),
        provinceId: university.provinceId,
        collegeId: BigInt(dto.collegeId),
        departmentId: BigInt(dto.departmentId),
        collegeYearId: BigInt(dto.collegeYearId),
      },
    });
    return student;
  }
}
