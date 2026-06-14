import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateStudentDto } from '../dtos/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStudentDto, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const university = await client.university.findUnique({
      where: { id: dto.universityId },
    });
    if (!university) throw new NotFoundException('الجامعة غير موجودة');

    try {
      const student = await client.student.create({
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
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('الرقم الجامعي مستخدم مسبقا، الرجاء إدخال رقم جامعي مختلف');
      }
      throw err;
    }
  }
}
