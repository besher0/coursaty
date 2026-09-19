import * as fs from 'fs';
import * as path from 'path';

/**
 * Contract tests for the StudentEnrollment backfill migration
 * (prisma/migrations/20260916120000_student_enrollment_and_request_snapshot).
 *
 * The migration is plain SQL executed by Prisma inside ONE transaction, so the
 * contract is encoded in the SQL text. These tests parse the migration file
 * and assert the fail-fast/atomicity contract, mirroring the rules enforced by
 * EnrollmentsService.validateAcademicHierarchy.
 *
 * The runnable end-to-end counterpart is
 * src/scripts/verify-student-enrollment-backfill.ts (npm run verify:enrollment-backfill),
 * which validates the same invariants against a real database.
 */

const MIGRATION_PATH = path.join(
  __dirname,
  '../../../../prisma/migrations/20260916120000_student_enrollment_and_request_snapshot/migration.sql',
);

const raw = fs.readFileSync(MIGRATION_PATH, 'utf8');

/** Removes `--` line comments so prose never matches (or hides) code patterns. */
function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

/** Full migration text with comments stripped. */
const code = stripComments(raw);

/** Slice a migration section (by its comment header) and strip its comments. */
function section(startMarker: string, endMarker?: string): string {
  const start = raw.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = endMarker ? raw.indexOf(endMarker, start) : raw.length;
  expect(end).toBeGreaterThan(start);
  return stripComments(raw.slice(start, end));
}

describe('StudentEnrollment backfill migration contract', () => {
  it('is wired as a single transaction (no explicit COMMIT/ROLLBACK mid-file)', () => {
    // "ON COMMIT DROP" (temp-table cleanup) is allowed; a manual COMMIT/ROLLBACK
    // statement would break Prisma's single-transaction migration execution.
    expect(code).not.toMatch(/^\s*(COMMIT|ROLLBACK|END TRANSACTION)\s*;/m);
    expect(code).toMatch(/ON COMMIT DROP/);
  });

  it('validates students BEFORE creating/backfilling StudentEnrollment', () => {
    const validate = raw.indexOf('PART 1');
    const createTable = code.indexOf('CREATE TABLE "StudentEnrollment"');
    const backfill = raw.indexOf('PART 3 — Backfill');
    expect(validate).toBeGreaterThan(-1);
    expect(createTable).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(createTable);
    expect(validate).toBeLessThan(backfill);
  });

  it('aborts with an exception (not a warning) when a student has invalid legacy academic data', () => {
    expect(code).not.toMatch(/RAISE WARNING/);
    expect(code).toMatch(/RAISE EXCEPTION/);
    expect(code).toMatch(/must be fixed first/i);
  });

  it('checks every hierarchy rule enforced by EnrollmentsService', () => {
    // University exists.
    expect(code).toMatch(/LEFT JOIN "University" u ON u\."id" = s\."universityId"/);
    expect(code).toMatch(/UNIVERSITY_NOT_FOUND/);
    // College exists + belongs to the student's university.
    expect(code).toMatch(/COLLEGE_NOT_FOUND/);
    expect(code).toMatch(/COLLEGE_NOT_IN_UNIVERSITY/);
    // Department exists + belongs to the student's college.
    expect(code).toMatch(/DEPARTMENT_NOT_FOUND/);
    expect(code).toMatch(/DEPARTMENT_NOT_IN_COLLEGE/);
    // CollegeYear exists + belongs to the student's college.
    expect(code).toMatch(/COLLEGE_YEAR_NOT_FOUND/);
    expect(code).toMatch(/COLLEGE_YEAR_NOT_IN_COLLEGE/);
    // Department-specific year must match the student's department.
    expect(code).toMatch(/DEPARTMENT_SPECIFIC_YEAR_MISMATCH/);
  });

  it('does NOT reject legacy students whose CollegeYear is inactive (isActive is a new-registration rule only)', () => {
    // The rule lives in EnrollmentsService.validateAcademicHierarchy for NEW
    // registrations / academic changes — never in the legacy backfill
    // validation.
    expect(code).not.toMatch(/COLLEGE_YEAR_INACTIVE/);
    expect(code).not.toMatch(/cy\."isActive"\s*=\s*false/);
    expect(code).not.toMatch(/NOT cy\."isActive"/);
  });

  it('does not restore global universityNumber uniqueness (new rule: unique per university+college)', () => {
    // Global unique index is dropped and replaced with a plain index.
    expect(code).toMatch(/DROP INDEX IF EXISTS "Student_universityNumber_key"/);
    expect(code).toMatch(/CREATE INDEX "Student_universityNumber_idx"/);
    expect(code).not.toMatch(/CREATE UNIQUE INDEX "Student_universityNumber_key"/);
    // Duplicate detection runs under the NEW rule (per university+college).
    expect(code).toMatch(/_duplicate_university_numbers/);
    expect(code).toMatch(
      /unique only within \(universityId, collegeId, universityNumber\)/,
    );
  });

  it('backfills unfiltered — no JOIN/WHERE filter that could silently skip students', () => {
    const backfill = section('INSERT INTO "StudentEnrollment"', 'PART 3b');

    expect(backfill).toMatch(/FROM "Student" s;\s*$/);
    expect(backfill).not.toMatch(/\bJOIN\b/);
    expect(backfill).not.toMatch(/\bWHERE\b/);
    expect(backfill).not.toMatch(/\bON CONFLICT\b/);
    expect(backfill).not.toMatch(/SKIP/i);
  });

  it('verifies Students == initial active enrollments and exactly one active per student after backfill', () => {
    const verify = section('PART 3b', 'PART 4');

    expect(verify).toMatch(/v_students <> v_active_enrollments/);
    expect(verify).toMatch(/HAVING count\(e\."id"\) <> 1/);
    expect(verify).toMatch(/do not have exactly one active StudentEnrollment/);
    expect(verify).toMatch(/do not mirror the legacy Student academic fields/);
  });

  it('preserves the legacy Student academic columns (no DDL on Student)', () => {
    expect(code).not.toMatch(/ALTER TABLE "Student"\s+DROP COLUMN/);
    expect(code).not.toMatch(/ALTER TABLE "Student"\s+ALTER COLUMN/);
    expect(code).not.toMatch(/ALTER TABLE "Student"\s+SET NOT NULL/);
    expect(code).not.toMatch(/ALTER TABLE "Student"\s+SET DATA TYPE/);
    const studentAlter = code.match(/ALTER TABLE "Student"[\s\S]*?;/g) ?? [];
    expect(studentAlter).toEqual([]);
  });

  it('creates one active enrollment per student (isActive=true, endedAt=NULL, startedAt=createdAt)', () => {
    const backfill = section('INSERT INTO "StudentEnrollment"', 'PART 3b');

    expect(backfill).toMatch(/true,\s*\n\s*s\."createdAt",\s*\n\s*NULL,/);
    expect(backfill).toMatch(/NULL,\s*\n\s*s\."createdAt",\s*\n\s*s\."createdAt"/);
  });

  it('pre-checks duplicate PENDING SubscriptionRequests and aborts instead of silently resolving them', () => {
    const pendingSection = section('PART 6');

    // Prose contract (may live in comments).
    expect(raw).toMatch(/at most one PENDING request per \(student, course\)/);
    expect(raw).toMatch(/do NOT silently delete, merge or approve/);
    // Code contract.
    expect(pendingSection).toMatch(/HAVING count\(\*\) > 1/);
    expect(pendingSection).toMatch(/RAISE EXCEPTION/);
    expect(pendingSection).toMatch(
      /CREATE UNIQUE INDEX "SubscriptionRequest_studentId_courseId_pending_key"/,
    );
    // Index creation happens only after the pre-check DO block.
    const preCheckEnd = pendingSection.indexOf('END $$;');
    const indexPart = pendingSection.slice(preCheckEnd);
    expect(indexPart).toMatch(/CREATE UNIQUE INDEX/);
  });

  it('does not touch subscription expiration behavior or the manual payment flow', () => {
    // No changes to StudentSubscription at all.
    expect(code).not.toMatch(/"StudentSubscription"/);
    // SubscriptionRequest changes are limited to additive snapshot columns plus
    // the partial unique index — no column alteration/removal.
    const requestAlter = code.match(/ALTER TABLE "SubscriptionRequest"[\s\S]*?;/g) ?? [];
    expect(requestAlter).toHaveLength(1);
    expect(requestAlter[0]).toMatch(/ADD COLUMN/);
    expect(requestAlter[0]).not.toMatch(/DROP COLUMN|ALTER COLUMN/);
  });
});
