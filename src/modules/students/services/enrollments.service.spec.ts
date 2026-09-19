import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EnrollmentsService } from './enrollments.service';

type Client = Record<string, any>;

function hierarchyClient(overrides: Record<string, any> = {}): Client {
  const university = 'university' in overrides ? overrides.university : { id: 'uni-1', provinceId: 'prov-1' };
  const college = 'college' in overrides ? overrides.college : { id: 'col-1', universityId: 'uni-1' };
  const department = 'department' in overrides ? overrides.department : { id: 'dep-1', collegeId: 'col-1' };
  const collegeYear = 'collegeYear' in overrides
    ? overrides.collegeYear
    : {
        id: 'year-1',
        collegeId: 'col-1',
        departmentId: null,
        isActive: true,
        academicYear: { id: 'ay-1', yearName: 'First', yearNumber: 1 },
      };

  return {
    university: { findUnique: jest.fn().mockResolvedValue(university) },
    college: { findUnique: jest.fn().mockResolvedValue(college) },
    department: { findUnique: jest.fn().mockResolvedValue(department) },
    collegeYear: { findUnique: jest.fn().mockResolvedValue(collegeYear) },
    ...overrides.studentEnrollment,
    ...overrides.student,
  };
}

function fullTx(overrides: Record<string, any> = {}): Client {
  const base = hierarchyClient(overrides);
  return {
    ...base,
    student: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          'studentFound' in overrides ? overrides.studentFound : { id: 'student-1' },
        ),
      update: jest.fn().mockResolvedValue({ id: 'student-1' }),
    },
    studentEnrollment: {
      findFirst: jest
        .fn()
        .mockResolvedValue('activeEnrollment' in overrides ? overrides.activeEnrollment : null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest
        .fn()
        .mockResolvedValue('created' in overrides ? overrides.created : { id: 'enrollment-2' }),
    },
  };
}

function createService(prisma: any = {}) {
  return new EnrollmentsService(prisma);
}

const validInput = {
  universityId: 'uni-1',
  collegeId: 'col-1',
  departmentId: 'dep-1',
  collegeYearId: 'year-1',
  universityNumber: '12345',
};

describe('EnrollmentsService academic hierarchy validation', () => {
  it('accepts a valid university/college/department/year combination', async () => {
    const service = createService();
    const client = hierarchyClient();

    await expect(
      service.validateAcademicHierarchy(client as any, validInput),
    ).resolves.toMatchObject({
      university: { id: 'uni-1' },
      college: { id: 'col-1' },
      departmentId: 'dep-1',
      collegeYearId: 'year-1',
      provinceId: 'prov-1',
    });
  });

  it('rejects a college that does not belong to the selected university', async () => {
    const service = createService();
    const client = hierarchyClient({
      college: { id: 'col-1', universityId: 'other-uni' },
    });

    await expect(
      service.validateAcademicHierarchy(client as any, validInput),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a department that does not belong to the selected college', async () => {
    const service = createService();
    const client = hierarchyClient({
      department: { id: 'dep-1', collegeId: 'other-college' },
    });

    await expect(
      service.validateAcademicHierarchy(client as any, validInput),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a collegeYear bound to another department', async () => {
    const service = createService();
    const client = hierarchyClient({
      collegeYear: {
        id: 'year-1',
        collegeId: 'col-1',
        departmentId: 'other-dep',
        isActive: true,
      },
    });

    await expect(
      service.validateAcademicHierarchy(client as any, validInput),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a collegeYear that does not belong to the selected college', async () => {
    const service = createService();
    const client = hierarchyClient({
      collegeYear: {
        id: 'year-1',
        collegeId: 'other-college',
        departmentId: null,
        isActive: true,
      },
    });

    await expect(
      service.validateAcademicHierarchy(client as any, validInput),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown university', async () => {
    const service = createService();
    const client = hierarchyClient({ university: null });

    await expect(
      service.validateAcademicHierarchy(client as any, validInput),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('EnrollmentsService initial enrollment', () => {
  it('creates the initial active enrollment and syncs legacy fields', async () => {
    const tx = fullTx();
    const service = createService();

    const enrollment = await service.createInitialEnrollment('student-1', validInput, tx as any);

    expect(tx.studentEnrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: 'student-1',
        universityId: 'uni-1',
        collegeId: 'col-1',
        departmentId: 'dep-1',
        collegeYearId: 'year-1',
        universityNumber: '12345',
        isActive: true,
      }),
    });
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: expect.objectContaining({
        universityId: 'uni-1',
        collegeId: 'col-1',
        universityNumber: '12345',
      }),
    });
    expect(enrollment).toEqual({ id: 'enrollment-2' });
  });
});

describe('EnrollmentsService changeAcademicProfile', () => {
  it('deactivates the previous enrollment and creates a new active one in one transaction', async () => {
    const activeEnrollment = {
      id: 'enrollment-1',
      universityId: 'uni-1',
      collegeId: 'col-1',
      departmentId: 'dep-1',
      collegeYearId: 'year-1',
      universityNumber: '12345',
    };
    const tx = fullTx({
      activeEnrollment,
      created: { id: 'enrollment-2' },
      college: { id: 'col-2', universityId: 'uni-1' },
      collegeYear: {
        id: 'year-2',
        collegeId: 'col-2',
        departmentId: null,
        isActive: true,
      },
    });
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const service = createService(prisma);

    const result = await service.changeAcademicProfile('student-1', {
      ...validInput,
      collegeId: 'col-2',
      universityId: 'uni-1',
      departmentId: null,
      collegeYearId: 'year-2',
    });

    // Sanity: the tx used by the service resolved a collegeYear for col-2.
    expect((tx.collegeYear.findUnique as jest.Mock)).toHaveBeenCalled();

    // old enrollment closed
    expect(tx.studentEnrollment.updateMany).toHaveBeenCalledWith({
      where: { id: 'enrollment-1', isActive: true },
      data: { isActive: false, endedAt: expect.any(Date) },
    });
    // new one active
    expect(tx.studentEnrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isActive: true,
        collegeId: 'col-2',
      }),
    });
    // legacy fields synced
    expect(tx.student.update).toHaveBeenCalled();
    expect(result).toEqual({ id: 'enrollment-2' });
  });

  it('rejects a change to an identical academic profile', async () => {
    const activeEnrollment = {
      id: 'enrollment-1',
      universityId: 'uni-1',
      collegeId: 'col-1',
      departmentId: 'dep-1',
      collegeYearId: 'year-1',
      universityNumber: '12345',
    };
    const tx = fullTx({ activeEnrollment });
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const service = createService(prisma);

    await expect(
      service.changeAcademicProfile('student-1', validInput),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('translates the per-university-college unique violation into a conflict error', async () => {
    const tx = fullTx();
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: 'universityId_collegeId_universityNumber' },
      } as any,
    );
    (tx.studentEnrollment.create as jest.Mock).mockRejectedValue(uniqueError);
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const service = createService(prisma);

    await expect(
      service.changeAcademicProfile('student-1', validInput),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not create a second active enrollment when none exists (first switch)', async () => {
    const tx = fullTx({ activeEnrollment: null, created: { id: 'enrollment-1' } });
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const service = createService(prisma);

    await service.changeAcademicProfile('student-1', validInput);

    expect(tx.studentEnrollment.updateMany).not.toHaveBeenCalled();
    expect(tx.studentEnrollment.create).toHaveBeenCalledTimes(1);
  });

  it('writes only the enrollment rows and the legacy sync during a switch', async () => {
    const tx = fullTx({
      activeEnrollment: {
        id: 'enrollment-old',
        universityId: 'uni-1',
        collegeId: 'col-1',
        departmentId: 'dep-1',
        collegeYearId: 'year-1',
        universityNumber: '12345',
      },
      college: { id: 'col-9', universityId: 'uni-9' },
      department: null,
      collegeYear: {
        id: 'year-9',
        collegeId: 'col-9',
        departmentId: null,
        isActive: true,
      },
    });
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const service = createService(prisma);

    await service.changeAcademicProfile('student-1', {
      ...validInput,
      universityId: 'uni-9',
      collegeId: 'col-9',
      departmentId: null,
      collegeYearId: 'year-9',
    });

    // Exactly one close + one create + one legacy-field sync. No other writes
    // exist on the tx mock, so any accidental write to another model would
    // throw "Cannot read properties of undefined" and fail this test.
    expect(tx.studentEnrollment.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.studentEnrollment.create).toHaveBeenCalledTimes(1);
    expect(tx.student.update).toHaveBeenCalledTimes(1);
  });
});
