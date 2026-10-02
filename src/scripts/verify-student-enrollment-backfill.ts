import { PrismaClient } from '@prisma/client';

/**
 * Post-migration verification for the StudentEnrollment legacy backfill
 * (prisma/migrations/20260916120000_student_enrollment_and_request_snapshot).
 *
 * Run against a database AFTER the migration was applied:
 *   npm run verify:enrollment-backfill
 *
 * Exits 0 when all checks pass; exits 1 with the offending rows otherwise.
 *
 * Checks:
 * 1. Number of Students == number of initial active StudentEnrollments.
 * 2. Every Student has EXACTLY one active StudentEnrollment (no silent skips,
 *    no duplicates).
 * 3. (Removed) legacy mirror check — Student no longer carries academic
 *    columns; the active enrollment is the single source of truth.
 * 4. Every active enrollment satisfies the same structural academic-hierarchy
 *    rules the migration enforced before backfilling (university exists,
 *    college exists and belongs to the university, department exists and
 *    belongs to the college, collegeYear exists and belongs to the college,
 *    department-specific years match the department).
 */

const prisma = new PrismaClient();

type Problem = { studentId: string; problem: string };

function printProblems(title: string, problems: Problem[]) {
  console.error(`\n${title}: ${problems.length}`);
  for (const p of problems.slice(0, 20)) {
    console.error(`  studentId=${p.studentId} | problem=${p.problem}`);
  }
  if (problems.length > 20) {
    console.error(`  ... and ${problems.length - 20} more`);
  }
}

async function main() {
  let failed = false;

  // ------------------------------------------------------------------
  // Check 1 — count equality.
  // ------------------------------------------------------------------
  const [studentCount, activeEnrollmentCount] = await Promise.all([
    prisma.student.count(),
    prisma.studentEnrollment.count({ where: { isActive: true } }),
  ]);

  console.log(`Students:                     ${studentCount}`);
  console.log(`Active StudentEnrollments:    ${activeEnrollmentCount}`);

  if (studentCount !== activeEnrollmentCount) {
    failed = true;
    console.error(
      `\nFAIL: number of Students (${studentCount}) != number of initial active StudentEnrollments (${activeEnrollmentCount}).`,
    );
  } else {
    console.log('OK: number of Students == number of initial active StudentEnrollments.');
  }

  // ------------------------------------------------------------------
  // Check 2 — exactly one active enrollment per student.
  // ------------------------------------------------------------------
  const perStudent = await prisma.studentEnrollment.groupBy({
    by: ['studentId'],
    where: { isActive: true },
    _count: { _all: true },
  });

  const problemsOnePerStudent: Problem[] = [];
  const seen = new Set(perStudent.map((g) => g.studentId));

  for (const group of perStudent) {
    if (group._count._all > 1) {
      problemsOnePerStudent.push({
        studentId: group.studentId,
        problem: `MULTIPLE_ACTIVE_ENROLLMENTS (${group._count._all})`,
      });
    }
  }

  const allStudentIds = await prisma.student.findMany({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const s of allStudentIds) {
    if (!seen.has(s.id)) {
      problemsOnePerStudent.push({ studentId: s.id, problem: 'NO_ACTIVE_ENROLLMENT (skipped)' });
    }
  }

  if (problemsOnePerStudent.length > 0) {
    failed = true;
    printProblems('Students without exactly one active enrollment', problemsOnePerStudent);
  } else {
    console.log('OK: every Student has exactly one active StudentEnrollment (none skipped).');
  }

  // ------------------------------------------------------------------
  // Check 4 — hierarchy validity of every active enrollment.
  // ------------------------------------------------------------------
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { isActive: true },
    include: { collegeYear: true },
  });
  const studentsById = new Map(
    (await prisma.student.findMany({ select: { id: true } })).map((s) => [s.id, s]),
  );
  const colleges = new Map(
    (await prisma.college.findMany()).map((c) => [c.id, c]),
  );
  const departments = new Map(
    (await prisma.department.findMany()).map((d) => [d.id, d]),
  );

  const problemsHierarchy: Problem[] = [];

  for (const e of enrollments) {
    const s = studentsById.get(e.studentId);
    if (!s) {
      problemsHierarchy.push({
        studentId: e.studentId,
        problem: 'STUDENT_NOT_FOUND (orphan enrollment)',
      });
      continue;
    }

    const college = colleges.get(e.collegeId);
    const department = e.departmentId ? departments.get(e.departmentId) : undefined;

    if (!college) {
      problemsHierarchy.push({ studentId: e.studentId, problem: 'COLLEGE_NOT_FOUND' });
      continue;
    }
    if (college.universityId !== e.universityId) {
      problemsHierarchy.push({
        studentId: e.studentId,
        problem: 'COLLEGE_NOT_IN_UNIVERSITY',
      });
    }
    if (e.departmentId && !department) {
      problemsHierarchy.push({ studentId: e.studentId, problem: 'DEPARTMENT_NOT_FOUND' });
    } else if (department && department.collegeId !== e.collegeId) {
      problemsHierarchy.push({
        studentId: e.studentId,
        problem: 'DEPARTMENT_NOT_IN_COLLEGE',
      });
    }
    if (e.collegeYear.collegeId !== e.collegeId) {
      problemsHierarchy.push({
        studentId: e.studentId,
        problem: 'COLLEGE_YEAR_NOT_IN_COLLEGE',
      });
    }
    if (e.collegeYear.departmentId) {
      if (!e.departmentId || e.collegeYear.departmentId !== e.departmentId) {
        problemsHierarchy.push({
          studentId: e.studentId,
          problem: 'DEPARTMENT_SPECIFIC_YEAR_MISMATCH',
        });
      }
    }
    // NOTE: CollegeYear.isActive is intentionally not checked here — it is a
    // rule for NEW registrations / future academic changes, not for migrated
    // historical students, whose year may legitimately be inactive.
  }

  if (problemsHierarchy.length > 0) {
    failed = true;
    printProblems('Active enrollments violating the academic hierarchy rules', problemsHierarchy);
  } else {
    console.log('OK: every active enrollment satisfies the academic-hierarchy rules.');
  }

  if (failed) {
    console.error(
      '\nVERIFICATION FAILED. Fix the data above, then re-run: npm run verify:enrollment-backfill',
    );
    process.exitCode = 1;
  } else {
    console.log('\nVERIFICATION PASSED: backfill is complete and consistent.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
