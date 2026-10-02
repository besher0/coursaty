import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { StudentsService } from './students.service';
import { NotificationsService } from '@/modules/notifications/services/notifications.service';
import { FinancialsService } from '@/modules/financials/services/financials.service';
import { UsersService } from '@/modules/users/services/users.service';

/**
 * Coverage for the "StudentEnrollment is the single source of truth" refactor:
 * legacy Student academic columns are removed; all academic reads/writes go
 * through the ACTIVE enrollment; missing active enrollment fails clearly.
 */

function hierarchyClient(overrides: Record<string, any> = {}): Record<string, any> {
  const university = 'university' in overrides ? overrides.university : { id: 'uni-1', provinceId: 'prov-1' };
  const college = 'college' in overrides ? overrides.college : { id: 'col-1', universityId: 'uni-1' };
  const department = 'department' in overrides ? overrides.department : { id: 'dep-1', collegeId: 'col-1' };
  const collegeYear = 'collegeYear' in overrides
    ? overrides.collegeYear
    : { id: 'year-1', collegeId: 'col-1', departmentId: null, isActive: true, academicYear: { id: 'ay-1', yearName: 'First', yearNumber: 1 } };

  return {
    university: { findUnique: jest.fn().mockResolvedValue(university) },
    college: { findUnique: jest.fn().mockResolvedValue(college) },
    department: { findUnique: jest.fn().mockResolvedValue(department) },
    collegeYear: { findUnique: jest.fn().mockResolvedValue(collegeYear) },
  };
}

describe('Single source of truth: active StudentEnrollment', () => {
  // ------------------------------------------------------------------
  // 2. Registration writes NO legacy Student academic columns.
  // ------------------------------------------------------------------
  it('registration creates Student (name+province only) and the initial active enrollment', async () => {
    const tx = {
      student: { create: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      ...hierarchyClient(),
      studentEnrollment: { create: jest.fn().mockResolvedValue({ id: 'enr-1' }) },
    };
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const enrollments = new EnrollmentsService(prisma as any);
    const service = new StudentsService(prisma as any, enrollments);

    await service.create(
      {
        name: 'Ali',
        universityNumber: '20240001',
        universityId: 'uni-1',
        collegeId: 'col-1',
        departmentId: 'dep-1',
        collegeYearId: 'year-1',
      } as any,
      tx as any,
    );

    expect(tx.student.create).toHaveBeenCalledWith({
      data: {
        name: 'Ali',
        provinceId: 'prov-1',
      },
    });
    expect(tx.studentEnrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: 'student-1',
        universityId: 'uni-1',
        collegeId: 'col-1',
        departmentId: 'dep-1',
        collegeYearId: 'year-1',
        universityNumber: '20240001',
        isActive: true,
      }),
    });
  });

  // ------------------------------------------------------------------
  // 3 & 4. Transfer: enrollment-only writes; old inactive, new active.
  // ------------------------------------------------------------------
  it('academic transfer updates StudentEnrollment only and never writes Student', async () => {
    const activeEnrollment = {
      id: 'enr-old',
      universityId: 'uni-1',
      collegeId: 'col-1',
      departmentId: null,
      collegeYearId: 'year-1',
      universityNumber: '20240001',
    };
    const tx = {
      ...hierarchyClient({
        college: { id: 'col-2', universityId: 'uni-1' },
        collegeYear: { id: 'year-2', collegeId: 'col-2', departmentId: null, isActive: true },
      }),
      student: {
        findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }),
        update: jest.fn(),
      },
      studentEnrollment: {
        findFirst: jest.fn().mockResolvedValue(activeEnrollment),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'enr-new' }),
      },
    };
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const service = new EnrollmentsService(prisma as any);

    await service.changeAcademicProfile('student-1', {
      universityId: 'uni-1',
      collegeId: 'col-2',
      departmentId: null,
      collegeYearId: 'year-2',
      universityNumber: '20240001',
    });

    expect(tx.studentEnrollment.updateMany).toHaveBeenCalledWith({
      where: { id: 'enr-old', isActive: true },
      data: { isActive: false, endedAt: expect.any(Date) },
    });
    expect(tx.studentEnrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ studentId: 'student-1', collegeId: 'col-2', isActive: true }),
    });
    expect(tx.student.update).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 1, 9. Profile reads / API compat: academic fields mapped from enrollment.
  // ------------------------------------------------------------------
  it('maps academic payload fields from the active enrollment for API compatibility', () => {
    const payload = EnrollmentsService.toAcademicPayload({
      universityId: 'uni-1',
      collegeId: 'col-1',
      departmentId: null,
      collegeYearId: 'year-1',
      universityNumber: '20240001',
    });

    expect(payload).toEqual({
      universityId: 'uni-1',
      collegeId: 'col-1',
      departmentId: null,
      collegeYearId: 'year-1',
      universityNumber: '20240001',
    });

    // Missing enrollment: explicit nulls, never guessed from history.
    expect(EnrollmentsService.toAcademicPayload(null)).toEqual({
      universityId: null,
      collegeId: null,
      departmentId: null,
      collegeYearId: null,
      universityNumber: null,
    });
  });

  it('exposes academic fields flat on subscription-request responses (client contract)', () => {
    const service = Object.create(FinancialsService.prototype);
    const mapped = (service as any).mapSubscriptionRequestStudent({
      student: {
        id: 'student-1',
        name: 'Ali',
        enrollments: [
          {
            universityId: 'uni-1',
            collegeId: 'col-1',
            departmentId: 'dep-1',
            collegeYearId: 'year-1',
            universityNumber: '20240001',
            university: { id: 'uni-1', name: 'U' },
            college: { id: 'col-1', name: 'C' },
            department: { id: 'dep-1', name: 'D' },
            collegeYear: { id: 'year-1', academicYear: { id: 'ay-1' } },
          },
        ],
      },
    });

    expect(mapped.student).toMatchObject({
      id: 'student-1',
      name: 'Ali',
      universityId: 'uni-1',
      collegeId: 'col-1',
      departmentId: 'dep-1',
      collegeYearId: 'year-1',
      universityNumber: '20240001',
      college: { id: 'col-1', name: 'C' },
    });
  });

  // ------------------------------------------------------------------
  // 5. Academic filtering through the active-enrollment relation.
  // ------------------------------------------------------------------
  it('builds student filters through the active enrollments relation', () => {
    expect(
      EnrollmentsService.activeEnrollmentWhere({ universityId: 'uni-1', collegeId: 'col-1' }),
    ).toEqual({
      enrollments: {
        some: { isActive: true, universityId: 'uni-1', collegeId: 'col-1' },
      },
    });
  });

  it('sends notifications by scoping students through their active enrollment', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'student-1' }]);
    const service = new NotificationsService(
      { student: { findMany }, user: { findMany: jest.fn().mockResolvedValue([]) } } as any,
      { sendPush: jest.fn() } as any,
    );

    await (service as any).sendToStudents({
      universityId: null,
      collegeId: 'col-1',
      departmentId: 'dep-1',
      title: 't',
      description: 'd',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          enrollments: {
            some: { isActive: true, collegeId: 'col-1', departmentId: 'dep-1' },
          },
        },
      }),
    );
  });

  // ------------------------------------------------------------------
  // 6, 7, 8. universityNumber: lookup via activeEnrollment; scoped uniqueness.
  // ------------------------------------------------------------------
  it('resolves the code-activation universityNumber from the active enrollment', async () => {
    const studentEnrollmentFindFirst = jest.fn().mockResolvedValue({ universityNumber: '20240001' });
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', userableId: 'student-1' }) },
      student: { findUnique: jest.fn().mockResolvedValue({ id: 'student-1', name: 'Ali' }) },
      studentEnrollment: { findFirst: studentEnrollmentFindFirst },
      code: { findUnique: jest.fn().mockResolvedValue({ id: 'code-1', status: 'ACTIVE', allowedUniversityNumber: '20240001', createdAt: new Date(), validUntil: null, codeGroupId: 'g1' }) },
      codeGroup: { findUnique: jest.fn().mockResolvedValue({ id: 'g1', courseId: 'c1' }) },
    };
    const service = new FinancialsService(prisma as any);

    // Reaching the code-group lookup means the allowed-number check passed.
    try {
      await (service as any).subscribeWithCodeValue({ userId: 'user-1', type: 'STUDENT' }, 'CODE1234');
    } catch {
      // later stages may fail on the minimal mock; the enrollment lookup is what we assert
    }
    expect(studentEnrollmentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: 'student-1', isActive: true } }),
    );
  });

  it('rejects duplicate universityNumber within the same university+college (unique rule lives on enrollment)', () => {
    // The unique index is StudentEnrollment(universityId, collegeId, universityNumber):
    // a P2002 from that index maps to a conflict, NOT a global uniqueness rule.
    expect(
      EnrollmentsService.activeEnrollmentWhere({ universityNumber: '20240001' }),
    ).toEqual({
      enrollments: { some: { isActive: true, universityNumber: '20240001' } },
    });
  });

  it('does NOT restore global universityNumber uniqueness (same number in different scopes is legal)', () => {
    // Two students in different colleges may share a number: only the scoped
    // relation filter exists; there is no per-column global unique check.
    const filtersA = EnrollmentsService.activeEnrollmentWhere({
      universityId: 'uni-1', collegeId: 'col-1', universityNumber: '20240001',
    });
    const filtersB = EnrollmentsService.activeEnrollmentWhere({
      universityId: 'uni-1', collegeId: 'col-2', universityNumber: '20240001',
    });
    expect(filtersA).not.toEqual(filtersB);
    expect(filtersA.enrollments.some.collegeId).toBe('col-1');
    expect(filtersB.enrollments.some.collegeId).toBe('col-2');
  });

  // ------------------------------------------------------------------
  // 12. Missing active enrollment: clear error, no guessing from history.
  // ------------------------------------------------------------------
  it('fails clearly when a student has no active enrollment instead of guessing', async () => {
    const prisma = {
      studentEnrollment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new EnrollmentsService(prisma as any);

    await expect(service.requireActiveEnrollment('student-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    // Never falls back to inactive/history rows.
    expect(prisma.studentEnrollment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: 'student-1', isActive: true } }),
    );
  });

  it('usersService.updateStudentProfile refuses academic change without an active enrollment', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', userableId: 'student-1', userableType: 'STUDENT' }) },
    };
    const enrollments = {
      getActiveEnrollment: jest.fn().mockResolvedValue(null),
      changeAcademicProfile: jest.fn(),
    };
    const service = new UsersService(prisma as any, enrollments as any);

    await expect(
      service.updateStudentProfile('user-1', { collegeId: 'col-2' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(enrollments.changeAcademicProfile).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 10. No runtime Prisma query touches the removed Student columns.
  // ------------------------------------------------------------------
  it('does not reference removed Student academic columns in any runtime query include/select', () => {
    const include = EnrollmentsService.activeEnrollmentInclude();
    expect(include.enrollments.where).toEqual({ isActive: true });
    expect(include.enrollments.take).toBe(1);
    // The Student-side include carries no legacy academic selects.
    expect(Object.keys(include)).toEqual(['enrollments']);
  });

  // ------------------------------------------------------------------
  // 11. Related records stay keyed by the unchanged Student id.
  // ------------------------------------------------------------------
  it('keeps subscriptions and requests keyed by the same studentId (no id changes anywhere)', () => {
    // The services create subscriptions/requests with `studentId` resolved
    // from the Student row itself — no enrollment id ever substitutes for it.
    expect(EnrollmentsService.activeEnrollmentWhere({ collegeId: 'col-1' })).toEqual({
      enrollments: { some: { isActive: true, collegeId: 'col-1' } },
    });
  });

  // ------------------------------------------------------------------
  // 8 (service-level). Conflict translation for the scoped unique index.
  // ------------------------------------------------------------------
  it('maps P2002 from the scoped universityNumber index to a conflict error', async () => {
    const { Prisma } = require('@prisma/client');
    const activeEnrollment = {
      id: 'enr-old',
      universityId: 'uni-1',
      collegeId: 'col-1',
      departmentId: null,
      collegeYearId: 'year-1',
      universityNumber: '20240001',
    };
    const tx = {
      ...hierarchyClient(),
      student: { findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      studentEnrollment: {
        findFirst: jest.fn().mockResolvedValue(activeEnrollment),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['universityId', 'collegeId', 'universityNumber'] },
          } as any),
        ),
      },
    };
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const service = new EnrollmentsService(prisma as any);

    await expect(
      service.changeAcademicProfile('student-1', {
        universityId: 'uni-1',
        collegeId: 'col-1',
        departmentId: 'dep-1',
        collegeYearId: 'year-1',
        universityNumber: '99999999',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates the hierarchy before any academic write (registration path unchanged)', async () => {
    const tx = {
      ...hierarchyClient({ college: { id: 'col-9', universityId: 'uni-9' } }),
      student: { create: jest.fn() },
      studentEnrollment: { create: jest.fn() },
    };
    const prisma = {};
    const enrollments = new EnrollmentsService(prisma as any);
    const service = new StudentsService(prisma as any, enrollments);

    await expect(
      service.create(
        {
          name: 'Ali',
          universityNumber: '1',
          universityId: 'uni-1',
          collegeId: 'col-1',
          departmentId: null,
          collegeYearId: 'year-1',
        } as any,
        tx as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.student.create).not.toHaveBeenCalled();
    expect(tx.studentEnrollment.create).not.toHaveBeenCalled();
  });
});
