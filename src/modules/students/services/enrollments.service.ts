import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export type AcademicProfileInput = {
  universityId: string;
  collegeId: string;
  departmentId?: string | null;
  collegeYearId: string;
  universityNumber?: string | null;
};

/**
 * Student academic enrollment lifecycle.
 *
 * - The source of truth for a student's CURRENT academic profile is the single
 *   active `StudentEnrollment` row (enforced by a partial unique index in the
 *   database).
 * - Legacy academic fields on `Student` are kept (transition period) and are
 *   synchronized with the active enrollment on every create/switch, because
 *   several read paths (admin searches, notifications, dashboards, code
 *   activation allowedUniversityNumber check) still read them. When all reads
 *   are migrated, the synchronization calls in this service can be removed.
 * - Changing academic info keeps the same Student id and only closes the old
 *   enrollment (endedAt + isActive=false); it never touches subscriptions,
 *   ratings, likes, used codes, etc.
 */
@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates the complete academic hierarchy:
   * university exists → college exists and belongs to the university →
   * department (when provided) exists and belongs to the college →
   * collegeYear exists and is valid for the college/department structure.
   */
  async validateAcademicHierarchy(
    client: Prisma.TransactionClient | PrismaService,
    input: {
      universityId: string;
      collegeId: string;
      departmentId?: string | null;
      collegeYearId: string;
    },
  ) {
    const university = await client.university.findUnique({
      where: { id: input.universityId },
    });
    if (!university) throw new NotFoundException('الجامعة غير موجودة');

    const college = await client.college.findUnique({
      where: { id: input.collegeId },
    });
    if (!college) throw new NotFoundException('الكلية غير موجودة');
    if (college.universityId !== input.universityId) {
      throw new BadRequestException('الكلية لا تتبع للجامعة');
    }

    let departmentId: string | null = null;
    if (input.departmentId) {
      const department = await client.department.findUnique({
        where: { id: input.departmentId },
      });
      if (!department) throw new NotFoundException('القسم غير موجود');
      if (department.collegeId !== input.collegeId) {
        throw new BadRequestException('القسم لا يتبع للكلية');
      }
      departmentId = department.id;
    }

    const collegeYear = await client.collegeYear.findUnique({
      where: { id: input.collegeYearId },
      include: { academicYear: true },
    });
    if (!collegeYear) throw new NotFoundException('السنة الدراسية غير موجودة');
    if (collegeYear.collegeId !== input.collegeId) {
      throw new BadRequestException('السنة الدراسية لا تتبع للكلية');
    }
    if (collegeYear.departmentId) {
      // Year rows bound to a department are only valid for that department.
      if (!departmentId || collegeYear.departmentId !== departmentId) {
        throw new BadRequestException('السنة الدراسية لا تتبع للقسم المحدد');
      }
    }
    if (!collegeYear.isActive) {
      throw new BadRequestException('السنة الدراسية غير مفعلة');
    }

    return {
      university,
      college,
      departmentId,
      collegeYearId: collegeYear.id,
      provinceId: university.provinceId,
    };
  }

  /**
   * Creates the first (active) enrollment for a student. Used by registration.
   * Runs inside the caller transaction when one is provided.
   */
  async createInitialEnrollment(
    studentId: string,
    input: AcademicProfileInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    const hierarchy = await this.validateAcademicHierarchy(client, {
      universityId: input.universityId,
      collegeId: input.collegeId,
      departmentId: input.departmentId ?? null,
      collegeYearId: input.collegeYearId,
    });

    const enrollment = await client.studentEnrollment.create({
      data: {
        studentId,
        universityId: hierarchy.university.id,
        collegeId: hierarchy.college.id,
        departmentId: hierarchy.departmentId,
        collegeYearId: hierarchy.collegeYearId,
        universityNumber: input.universityNumber ?? null,
        isActive: true,
      },
    });

    await this.syncLegacyFields(client, studentId, {
      universityId: hierarchy.university.id,
      provinceId: hierarchy.provinceId,
      collegeId: hierarchy.college.id,
      departmentId: hierarchy.departmentId,
      collegeYearId: hierarchy.collegeYearId,
      universityNumber: input.universityNumber ?? null,
    });

    return enrollment;
  }

  /**
   * Returns the current active enrollment of a student (or null).
   */
  getActiveEnrollment(studentId: string) {
    return this.prisma.studentEnrollment.findFirst({
      where: { studentId, isActive: true },
      include: {
        university: { select: { id: true, name: true } },
        college: { select: { id: true, name: true, universityId: true } },
        department: { select: { id: true, name: true, collegeId: true } },
        collegeYear: {
          include: {
            academicYear: {
              select: { id: true, yearName: true, yearNumber: true },
            },
          },
        },
      },
    });
  }

  /**
   * Switches a student's academic profile:
   * 1. validates the new academic hierarchy,
   * 2. inside one transaction: closes the previous active enrollment
   *    (isActive=false + endedAt), creates the new active enrollment and
   *    synchronizes the legacy Student fields still used by old code paths.
   *
   * The student keeps the same id and all related records (subscriptions,
   * ratings, likes, used codes, requests) are untouched. Old enrollment rows
   * are preserved as history.
   */
  async changeAcademicProfile(studentId: string, input: AcademicProfileInput) {
    try {
      const enrollment = await this.prisma.$transaction(async (tx) => {
        // Validate inside the transaction so the hierarchy cannot change
        // between validation and the enrollment switch.
        const hierarchy = await this.validateAcademicHierarchy(tx, {
          universityId: input.universityId,
          collegeId: input.collegeId,
          departmentId: input.departmentId ?? null,
          collegeYearId: input.collegeYearId,
        });

        const student = await tx.student.findUnique({
          where: { id: studentId },
          select: { id: true },
        });
        if (!student) throw new NotFoundException('الطالب غير موجود');

        const activeEnrollment = await tx.studentEnrollment.findFirst({
          where: { studentId, isActive: true },
        });

        const sameAsActive =
          activeEnrollment &&
          activeEnrollment.universityId === hierarchy.university.id &&
          activeEnrollment.collegeId === hierarchy.college.id &&
          activeEnrollment.departmentId === hierarchy.departmentId &&
          activeEnrollment.collegeYearId === hierarchy.collegeYearId &&
          (activeEnrollment.universityNumber ?? null) ===
            (input.universityNumber ?? null);

        if (sameAsActive) {
          throw new BadRequestException('البيانات الأكاديمية مطابقة للبيانات الحالية');
        }

        if (activeEnrollment) {
          await tx.studentEnrollment.updateMany({
            where: {
              id: activeEnrollment.id,
              isActive: true,
            },
            data: {
              isActive: false,
              endedAt: new Date(),
            },
          });
        }

        const created = await tx.studentEnrollment.create({
          data: {
            studentId,
            universityId: hierarchy.university.id,
            collegeId: hierarchy.college.id,
            departmentId: hierarchy.departmentId,
            collegeYearId: hierarchy.collegeYearId,
            universityNumber: input.universityNumber ?? null,
            isActive: true,
          },
        });

        await this.syncLegacyFields(tx, studentId, {
          universityId: hierarchy.university.id,
          provinceId: hierarchy.provinceId,
          collegeId: hierarchy.college.id,
          departmentId: hierarchy.departmentId,
          collegeYearId: hierarchy.collegeYearId,
          universityNumber: input.universityNumber ?? null,
        });

        return created;
      });

      return enrollment;
    } catch (err) {
      // P2015: related record not found. P2002: unique constraint violation.
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictException(
            'الرقم الجامعي مستخدم مسبقا داخل نفس الجامعة والكلية',
          );
        }
      }
      throw err;
    }
  }

  /**
   * Transition-period synchronization: keeps the legacy Student academic
   * columns aligned with the active enrollment because they are still read by:
   * - code activation (allowedUniversityNumber check)
   * - admin students directory/search & profile views
   * - notifications scoping
   * - dashboards / guest preference flows
   * Once all reads migrate to StudentEnrollment, remove the call sites.
   */
  private async syncLegacyFields(
    client: Prisma.TransactionClient | PrismaService,
    studentId: string,
    fields: {
      universityId: string;
      provinceId: string;
      collegeId: string;
      departmentId: string | null;
      collegeYearId: string;
      universityNumber: string | null;
    },
  ) {
    await client.student.update({
      where: { id: studentId },
      data: {
        universityId: fields.universityId,
        provinceId: fields.provinceId,
        collegeId: fields.collegeId,
        departmentId: fields.departmentId,
        collegeYearId: fields.collegeYearId,
        universityNumber: fields.universityNumber,
      },
    });
  }
}
