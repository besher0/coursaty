-- Remove the legacy Student academic columns now that the active
-- StudentEnrollment is the single source of truth.
--
-- Preconditions (verified by the backfill migration
-- 20260916120000_student_enrollment_and_request_snapshot and by
-- npm run verify:enrollment-backfill):
--   - every Student has exactly one active StudentEnrollment
--   - active enrollments mirror what used to be the Student academic columns
--
-- Safety rules:
--   - No data is copied, mutated, deleted or reset here. Student ids and all
--     relationships to Student (subscriptions, progress, ratings, financial
--     data, manual payment flow, subscription expiration, codes) are untouched.
--   - This migration does NOT edit the already-applied backfill migration.
--   - If any student is missing an active enrollment (or has several), the
--     migration aborts BEFORE any DDL runs. Nothing is dropped partially.
--   - Prisma runs this file in one transaction, so an abort leaves no partial
--     DDL behind.
--
-- The SQL below was derived from `prisma migrate diff` against the updated
-- schema; run `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`
-- against a staging copy to confirm it matches before applying.

-- ****************************************************************************
-- PART 1 — Defensive validation (fail-fast, BEFORE any DDL).
-- Every Student must have EXACTLY one active StudentEnrollment. If not, abort
-- with a clear error and the SQL to locate the offending students. No fallback
-- values, no silent repair, no data mutation.
-- ****************************************************************************
DO $$
DECLARE
  v_students           bigint;
  v_active_enrollments bigint;
  v_broken_count       bigint;
  v_detail             text;
  r                    record;
BEGIN
  SELECT count(*) INTO v_students FROM "Student";
  SELECT count(*) INTO v_active_enrollments
  FROM "StudentEnrollment" WHERE "isActive" = true;

  IF v_students <> v_active_enrollments THEN
    RAISE EXCEPTION '%', concat(
      'Remove-legacy-columns aborted: number of Students (',
      v_students,
      ') != number of active StudentEnrollments (',
      v_active_enrollments,
      '). Every student must have exactly one active enrollment before the legacy columns can be removed. Fix the data first. Diagnostic query: ',
      'SELECT s."id" FROM "Student" s LEFT JOIN "StudentEnrollment" e ON e."studentId" = s."id" AND e."isActive" = true GROUP BY s."id" HAVING count(e."id") <> 1;'
    );
  END IF;

  SELECT count(*) INTO v_broken_count
  FROM (
    SELECT s."id"
    FROM "Student" s
    LEFT JOIN "StudentEnrollment" e ON e."studentId" = s."id" AND e."isActive" = true
    GROUP BY s."id"
    HAVING count(e."id") <> 1
  ) broken;

  IF v_broken_count > 0 THEN
    v_detail := '';
    FOR r IN
      SELECT s."id" AS "studentId", count(e."id") AS "activeEnrollmentCount"
      FROM "Student" s
      LEFT JOIN "StudentEnrollment" e ON e."studentId" = s."id" AND e."isActive" = true
      GROUP BY s."id"
      HAVING count(e."id") <> 1
      ORDER BY s."id"
      LIMIT 10
    LOOP
      v_detail := v_detail || format(
        E'\n  studentId=%s | activeEnrollmentCount=%s (expected 1)',
        r."studentId",
        r."activeEnrollmentCount"
      );
    END LOOP;
    RAISE EXCEPTION '%', concat(
      'Remove-legacy-columns aborted: ',
      v_broken_count,
      ' student(s) do not have exactly one active StudentEnrollment (0 = missing, >1 = duplicated). No column may be dropped while the enrollment invariant is violated. Fix the data first.\nOffending students (first 10):',
      v_detail,
      '\nDiagnostic query: SELECT s."id", count(e."id") AS "activeEnrollmentCount" FROM "Student" s LEFT JOIN "StudentEnrollment" e ON e."studentId" = s."id" AND e."isActive" = true GROUP BY s."id" HAVING count(e."id") <> 1 ORDER BY s."id";'
    );
  END IF;
END $$;

-- ****************************************************************************
-- PART 2 — Drop legacy Student academic indexes and foreign keys.
-- ****************************************************************************
DROP INDEX IF EXISTS "Student_universityNumber_idx";
DROP INDEX IF EXISTS "Student_universityId_idx";
DROP INDEX IF EXISTS "Student_collegeId_idx";
DROP INDEX IF EXISTS "Student_collegeYearId_idx";

-- FKs: use IF EXISTS so the migration tolerates databases where a constraint
-- was already dropped (names verified against the last applied migration).
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_universityId_fkey";
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_collegeId_fkey";
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_departmentId_fkey";
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_collegeYearId_fkey";

-- ****************************************************************************
-- PART 3 — Drop the legacy Student academic columns.
-- universityNumber: global uniqueness was already relaxed to a plain index by
-- the backfill migration; the NEW rule (unique within university + college)
-- lives on StudentEnrollment.universityId + collegeId + universityNumber.
-- ****************************************************************************
ALTER TABLE "Student"
  DROP COLUMN IF EXISTS "universityId",
  DROP COLUMN IF EXISTS "collegeId",
  DROP COLUMN IF EXISTS "departmentId",
  DROP COLUMN IF EXISTS "collegeYearId",
  DROP COLUMN IF EXISTS "universityNumber";

-- ****************************************************************************
-- PART 4 — Confirm the removal is complete (belt and braces). If any legacy
-- column survived (unexpected naming on some environment), abort loudly.
-- ****************************************************************************
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM information_schema.columns
  WHERE table_name = 'Student'
    AND column_name IN ('universityId', 'collegeId', 'departmentId', 'collegeYearId', 'universityNumber');

  IF v_remaining > 0 THEN
    RAISE EXCEPTION '%', concat(
      'Remove-legacy-columns verification failed: ',
      v_remaining,
      ' legacy academic column(s) still present on Student. Aborting so nothing is half-applied.'
    );
  END IF;
END $$;
