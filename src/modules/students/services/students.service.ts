import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { EnrollmentsService } from './enrollments.service';
import { CreateStudentDto } from '../dtos/create-student.dto';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async create(dto: CreateStudentDto, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;

    // The full academic hierarchy (university → college → department → year)
    // is validated before anything is created.
    const hierarchy = await this.enrollments.validateAcademicHierarchy(client, {
      universityId: dto.universityId,
      collegeId: dto.collegeId,
      departmentId: dto.departmentId ?? null,
      collegeYearId: dto.collegeYearId,
    });

    try {
      // Academic identity is stored ONLY on the active StudentEnrollment.
      // The Student row keeps name (and provinceId for legacy geolocation
      // reads); no academic column is written to Student anymore.
      const student = await client.student.create({
        data: {
          name: dto.name,
          provinceId: hierarchy.provinceId,
        },
      });

      // Initial active enrollment. When called from registerComplete this runs
      // inside the registration transaction, so student + user + enrollment
      // either all succeed or all roll back.
      await this.enrollments.createInitialEnrollment(
        student.id,
        {
          universityId: hierarchy.university.id,
          collegeId: hierarchy.college.id,
          departmentId: hierarchy.departmentId,
          collegeYearId: hierarchy.collegeYearId,
          universityNumber: dto.universityNumber ?? null,
        },
        tx,
      );

      return student;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('الرقم الجامعي مستخدم مسبقا داخل نفس الجامعة والكلية');
      }
      throw err;
    }
  }
}
