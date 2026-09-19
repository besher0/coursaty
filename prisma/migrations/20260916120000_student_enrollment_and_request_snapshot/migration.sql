-- StudentAcademicEnrollment feature + SubscriptionRequest payment snapshot feature.
--
-- Migration safety notes:
-- 1. Nothing is deleted. Legacy Student academic columns stay in place and are
--    synchronized with the active enrollment until all reads are migrated.
-- 2. Fail-fast validation (PART 1): EVERY existing Student is validated against
--    the same academic-hierarchy rules enforced by EnrollmentsService
--    (university exists; college exists and belongs to the student's
--    university; department — when present — exists and belongs to the
--    student's college; collegeYear exists, belongs to the student's college,
--    is compatible with the student's department when the year row is
--    department-specific).
--    NOTE: CollegeYear.isActive is intentionally NOT checked here. It is a
--    rule for NEW registrations / future academic changes (enforced by
--    EnrollmentsService.validateAcademicHierarchy), not for migrating
--    historical existing students, whose year may legitimately be inactive.
-- 3. University-number rule: `universityNumber` must be unique only within
--    (universityId, collegeId, universityNumber). The global unique index on
--    Student.universityNumber is still relaxed to a plain index (NOT restored),
--    but legacy students that already duplicate a number within the same
--    university + college would make the backfill violate the new
--    StudentEnrollment unique index, so PART 1 aborts the migration and shows
--    how to locate the conflicting students instead of skipping them.
-- 4. If ANY existing Student has invalid academic data the migration aborts
--    with a clear error and the diagnostic SQL needed to locate the offending
--    rows. No student is skipped, nothing is auto-modified or deleted, no
--    fallback values are invented. Prisma runs each migration file in a single
--    transaction, so an abort leaves NO partial backfill and NO partial DDL.
-- 5. Backfill (PART 3) creates exactly ONE active StudentEnrollment per
--    existing Student from the legacy academic fields. PART 3b re-verifies,
--    before the migration may finish, that:
--      number of Students == number of initial active StudentEnrollments,
--    every student has exactly one active enrollment, and every active
--    enrollment mirrors the student's legacy academic fields.
-- 6. Duplicate PENDING SubscriptionRequests are detected before the partial
--    unique index is created (PART 6) and abort the migration instead of being
--    silently resolved.

-- ****************************************************************************
-- PART 1 — Validate ALL existing students BEFORE any backfill (fail-fast).
-- A student is valid only if its legacy academic fields can back an initial
-- active StudentEnrollment under the rules enforced by EnrollmentsService:
--   - universityId present and University exists
--   - collegeId present, College exists and belongs to the student's university
--   - departmentId, when present, exists and belongs to the student's college
--   - collegeYearId present, CollegeYear exists and belongs to the student's
--     college
--   - if the CollegeYear is department-specific, it must match the student's
--     department
--   - universityNumber duplicate rule: unique only within
--     (universityId, collegeId, universityNumber)
-- CollegeYear.isActive is deliberately NOT checked here: it is a rule for NEW
-- registrations / future academic changes (still enforced by
-- EnrollmentsService.validateAcademicHierarchy), not for migrating historical
-- existing students, whose year may legitimately be inactive.
-- If even ONE student is invalid, the migration FAILS. Nothing is skipped,
-- auto-modified, deleted, or defaulted.
-- ****************************************************************************
DO $$
DECLARE
  v_invalid_sql      text;
  v_dup_numbers_sql  text;
  v_bad_count        bigint;
  v_dup_count        bigint;
  v_detail           text;
  r                  record;
BEGIN
  -- Diagnostic query: every Student whose legacy academic data cannot back an
  -- initial StudentEnrollment, with the detected problem(s).
  v_invalid_sql := $diag$
    SELECT * FROM (
      SELECT
        s."id"               AS "studentId",
        s."universityId"     AS "universityId",
        s."collegeId"        AS "collegeId",
        s."departmentId"     AS "departmentId",
        s."collegeYearId"    AS "collegeYearId",
        s."universityNumber" AS "universityNumber",
        concat_ws(' | ',
          CASE WHEN s."universityId" IS NULL
               THEN 'MISSING_UNIVERSITY_REF' END,
          CASE WHEN s."universityId" IS NOT NULL AND u."id" IS NULL
               THEN 'UNIVERSITY_NOT_FOUND' END,
          CASE WHEN s."collegeId" IS NULL
               THEN 'MISSING_COLLEGE_REF' END,
          CASE WHEN s."collegeId" IS NOT NULL AND c."id" IS NULL
               THEN 'COLLEGE_NOT_FOUND' END,
          CASE WHEN s."collegeId" IS NOT NULL AND c."id" IS NOT NULL
                    AND c."universityId" IS DISTINCT FROM s."universityId"
               THEN 'COLLEGE_NOT_IN_UNIVERSITY' END,
          CASE WHEN s."departmentId" IS NOT NULL AND d."id" IS NULL
               THEN 'DEPARTMENT_NOT_FOUND' END,
          CASE WHEN s."departmentId" IS NOT NULL AND d."id" IS NOT NULL
                    AND d."collegeId" IS DISTINCT FROM s."collegeId"
               THEN 'DEPARTMENT_NOT_IN_COLLEGE' END,
          CASE WHEN s."collegeYearId" IS NULL
               THEN 'MISSING_COLLEGE_YEAR_REF' END,
          CASE WHEN s."collegeYearId" IS NOT NULL AND cy."id" IS NULL
               THEN 'COLLEGE_YEAR_NOT_FOUND' END,
          CASE WHEN s."collegeYearId" IS NOT NULL AND cy."id" IS NOT NULL
                    AND cy."collegeId" IS DISTINCT FROM s."collegeId"
               THEN 'COLLEGE_YEAR_NOT_IN_COLLEGE' END,
          CASE WHEN cy."id" IS NOT NULL AND cy."departmentId" IS NOT NULL
                    AND (s."departmentId" IS NULL
                         OR cy."departmentId" IS DISTINCT FROM s."departmentId")
               THEN 'DEPARTMENT_SPECIFIC_YEAR_MISMATCH' END
        ) AS "problem"
      FROM "Student" s
      LEFT JOIN "University" u ON u."id" = s."universityId"
      LEFT JOIN "College" c ON c."id" = s."collegeId"
      LEFT JOIN "Department" d ON d."id" = s."departmentId"
      LEFT JOIN "CollegeYear" cy ON cy."id" = s."collegeYearId"
    ) flagged
    WHERE flagged."problem" <> ''
    ORDER BY "problem", "studentId"
  $diag$;

  -- Diagnostic query: universityNumber duplicates under the NEW rule
  -- (unique only within universityId + collegeId; NOT globally).
  v_dup_numbers_sql := $diag$
    SELECT
      s."universityId",
      s."collegeId",
      s."universityNumber",
      count(*)    AS "studentCount",
      min(s."id") AS "exampleStudentId"
    FROM "Student" s
    WHERE s."universityNumber" IS NOT NULL
    GROUP BY s."universityId", s."collegeId", s."universityNumber"
    HAVING count(*) > 1
    ORDER BY "studentCount" DESC, s."universityId", s."collegeId", s."universityNumber"
  $diag$;

  EXECUTE format(
    'CREATE TEMP TABLE _invalid_legacy_students ON COMMIT DROP AS %s',
    v_invalid_sql
  );
  EXECUTE format(
    'CREATE TEMP TABLE _duplicate_university_numbers ON COMMIT DROP AS %s',
    v_dup_numbers_sql
  );

  SELECT count(*) INTO v_bad_count FROM _invalid_legacy_students;

  IF v_bad_count > 0 THEN
    v_detail := '';
    FOR r IN
      SELECT * FROM _invalid_legacy_students LIMIT 10
    LOOP
      v_detail := v_detail || format(
        E'\n  studentId=%s | universityId=%s | collegeId=%s | departmentId=%s | collegeYearId=%s | universityNumber=%s | problem=%s',
        r."studentId",
        COALESCE(r."universityId", 'NULL'),
        COALESCE(r."collegeId", 'NULL'),
        COALESCE(r."departmentId", 'NULL'),
        COALESCE(r."collegeYearId", 'NULL'),
        COALESCE(r."universityNumber", 'NULL'),
        r."problem"
      );
    END LOOP;
    IF v_bad_count > 10 THEN
      v_detail := v_detail || format(
        E'\n  ... and %s more student(s). Run the diagnostic query below for the full list.',
        v_bad_count - 10
      );
    END IF;

    RAISE EXCEPTION '%', concat(
      $msg$StudentEnrollment backfill aborted: $msg$,
      v_bad_count,
      $msg$ existing Student(s) have invalid legacy academic data.

Every existing Student must be convertible into exactly one initial active StudentEnrollment. Invalid Student academic data must be fixed first. Do NOT skip students, do NOT delete or automatically modify their academic data, and do NOT invent fallback values. Fix the students below, then re-run the migration.

Offending students (first 10):$msg$,
      v_detail,
      $msg$

Diagnostic query (affected students with the detected problem):
$msg$,
      v_invalid_sql
    );
  END IF;

  SELECT count(*) INTO v_dup_count FROM _duplicate_university_numbers;

  IF v_dup_count > 0 THEN
    v_detail := '';
    FOR r IN
      SELECT * FROM _duplicate_university_numbers LIMIT 10
    LOOP
      v_detail := v_detail || format(
        E'\n  universityId=%s | collegeId=%s | universityNumber=%s | studentCount=%s | exampleStudentId=%s',
        r."universityId",
        r."collegeId",
        r."universityNumber",
        r."studentCount",
        r."exampleStudentId"
      );
    END LOOP;
    IF v_dup_count > 10 THEN
      v_detail := v_detail || format(
        E'\n  ... and %s more group(s). Run the diagnostic query below for the full list.',
        v_dup_count - 10
      );
    END IF;

    RAISE EXCEPTION '%', concat(
      $msg$StudentEnrollment backfill aborted: $msg$,
      v_dup_count,
      $msg$ group(s) of Students share the same universityNumber within the same university + college.

The new rule allows universityNumber to be unique only within (universityId, collegeId, universityNumber); the backfill would violate the new StudentEnrollment unique index. Resolve these duplicates manually (decide which student keeps the number; do NOT silently rename or delete), then re-run the migration.

Offending groups (first 10):$msg$,
      v_detail,
      $msg$

Diagnostic query (duplicate university numbers under the new rule):
$msg$,
      v_dup_numbers_sql
    );
  END IF;
END $$;

-- ****************************************************************************
-- PART 2 — Create StudentEnrollment table.
-- ****************************************************************************
CREATE TABLE "StudentEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "departmentId" TEXT,
    "collegeYearId" TEXT NOT NULL,
    "universityNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentEnrollment_studentId_idx" ON "StudentEnrollment"("studentId");
CREATE INDEX "StudentEnrollment_isActive_idx" ON "StudentEnrollment"("isActive");
CREATE INDEX "StudentEnrollment_universityId_idx" ON "StudentEnrollment"("universityId");
CREATE INDEX "StudentEnrollment_collegeId_idx" ON "StudentEnrollment"("collegeId");
CREATE INDEX "StudentEnrollment_departmentId_idx" ON "StudentEnrollment"("departmentId");
CREATE INDEX "StudentEnrollment_collegeYearId_idx" ON "StudentEnrollment"("collegeYearId");

-- universityNumber is unique within university + college (NOT globally).
-- NULLs never conflict with each other in PostgreSQL unique indexes, so
-- students without a university number are handled safely.
CREATE UNIQUE INDEX "StudentEnrollment_universityId_collegeId_universityNumber_key"
ON "StudentEnrollment"("universityId", "collegeId", "universityNumber");

-- ONE active enrollment per student (partial unique index — Prisma cannot
-- express this, so it is created as raw SQL).
CREATE UNIQUE INDEX "StudentEnrollment_studentId_active_key"
ON "StudentEnrollment"("studentId")
WHERE "isActive" = true;

ALTER TABLE "StudentEnrollment"
ADD CONSTRAINT "StudentEnrollment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentEnrollment"
ADD CONSTRAINT "StudentEnrollment_universityId_fkey"
FOREIGN KEY ("universityId") REFERENCES "University"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentEnrollment"
ADD CONSTRAINT "StudentEnrollment_collegeId_fkey"
FOREIGN KEY ("collegeId") REFERENCES "College"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentEnrollment"
ADD CONSTRAINT "StudentEnrollment_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentEnrollment"
ADD CONSTRAINT "StudentEnrollment_collegeYearId_fkey"
FOREIGN KEY ("collegeYearId") REFERENCES "CollegeYear"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- ****************************************************************************
-- PART 3 — Backfill: exactly ONE active StudentEnrollment per existing
-- Student, built from the legacy Student academic fields. PART 1 has already
-- proven that every Student is valid, so this INSERT is intentionally
-- unfiltered: no JOINs, no WHERE, no student can be silently skipped. If any
-- row still fails a constraint, the transaction aborts and nothing is written.
-- Legacy Student academic columns are NOT touched: they stay synchronized
-- with the active enrollment during the transition period.
-- ****************************************************************************
INSERT INTO "StudentEnrollment" (
  "id", "studentId", "universityId", "collegeId", "departmentId",
  "collegeYearId", "universityNumber", "isActive", "startedAt", "endedAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  s."id",
  s."universityId",
  s."collegeId",
  s."departmentId",
  s."collegeYearId",
  s."universityNumber",
  true,
  s."createdAt",
  NULL,
  s."createdAt",
  s."createdAt"
FROM "Student" s;

-- ****************************************************************************
-- PART 3b — Post-backfill verification. The migration must NOT finish
-- successfully unless:
--   - number of Students == number of initial active StudentEnrollments,
--   - every Student has EXACTLY one active enrollment (no skips, no extras),
--   - every active enrollment mirrors the student's legacy academic fields.
-- Any failure aborts the migration (and the whole transaction).
-- ****************************************************************************
DO $$
DECLARE
  v_students           bigint;
  v_active_enrollments bigint;
  v_broken_count       bigint;
  v_mismatch_count     bigint;
  v_detail             text;
  r                    record;
BEGIN
  SELECT count(*) INTO v_students FROM "Student";
  SELECT count(*) INTO v_active_enrollments
  FROM "StudentEnrollment" WHERE "isActive" = true;

  IF v_students <> v_active_enrollments THEN
    RAISE EXCEPTION '%', concat(
      $msg$StudentEnrollment backfill verification failed: expected number of Students (= $msg$,
      v_students,
      $msg$) to equal number of initial active StudentEnrollments (= $msg$,
      v_active_enrollments,
      $msg$). Exactly one active enrollment per student is required.$msg$
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
      $msg$StudentEnrollment backfill verification failed: $msg$,
      v_broken_count,
      $msg$ student(s) do not have exactly one active StudentEnrollment (0 = skipped, >1 = duplicated). No student may be silently skipped and none may receive multiple initial enrollments.

Offending students (first 10):$msg$,
      v_detail
    );
  END IF;

  SELECT count(*) INTO v_mismatch_count
  FROM "StudentEnrollment" e
  JOIN "Student" s ON s."id" = e."studentId"
  WHERE e."isActive" = true
    AND (e."universityId"     IS DISTINCT FROM s."universityId"
      OR e."collegeId"        IS DISTINCT FROM s."collegeId"
      OR e."departmentId"     IS DISTINCT FROM s."departmentId"
      OR e."collegeYearId"    IS DISTINCT FROM s."collegeYearId"
      OR e."universityNumber" IS DISTINCT FROM s."universityNumber");

  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION '%', concat(
      $msg$StudentEnrollment backfill verification failed: $msg$,
      v_mismatch_count,
      $msg$ active StudentEnrollment row(s) do not mirror the legacy Student academic fields. The backfill must copy the legacy values unchanged.

Diagnostic query:
SELECT e."studentId",
       e."universityId" AS enrollmentUniversityId, s."universityId" AS studentUniversityId,
       e."collegeId" AS enrollmentCollegeId, s."collegeId" AS studentCollegeId,
       e."departmentId" AS enrollmentDepartmentId, s."departmentId" AS studentDepartmentId,
       e."collegeYearId" AS enrollmentCollegeYearId, s."collegeYearId" AS studentCollegeYearId,
       e."universityNumber" AS enrollmentUniversityNumber, s."universityNumber" AS studentUniversityNumber
FROM "StudentEnrollment" e
JOIN "Student" s ON s."id" = e."studentId"
WHERE e."isActive" = true
  AND (e."universityId" IS DISTINCT FROM s."universityId"
    OR e."collegeId" IS DISTINCT FROM s."collegeId"
    OR e."departmentId" IS DISTINCT FROM s."departmentId"
    OR e."collegeYearId" IS DISTINCT FROM s."collegeYearId"
    OR e."universityNumber" IS DISTINCT FROM s."universityNumber");$msg$
    );
  END IF;
END $$;

-- ****************************************************************************
-- PART 4 — Relax the GLOBAL uniqueness of Student.universityNumber.
-- The final source of truth is StudentEnrollment (unique per university +
-- college). The index is replaced by a plain index so legacy lookups/searches
-- keep working. Global uniqueness is NOT restored.
-- ****************************************************************************
DROP INDEX IF EXISTS "Student_universityNumber_key";
CREATE INDEX "Student_universityNumber_idx" ON "Student"("universityNumber");

-- ****************************************************************************
-- PART 5 — SubscriptionRequest: payment snapshot columns.
-- Existing rows keep working: all new columns are NOT NULL with a zero
-- default, so legacy PENDING requests can still be approved (they will grant
-- the subscription; review the amounts manually if needed).
-- ****************************************************************************
ALTER TABLE "SubscriptionRequest"
ADD COLUMN "receiptFileName" TEXT,
ADD COLUMN "receiptMimeType" TEXT,
ADD COLUMN "receiptSizeBytes" INTEGER,
ADD COLUMN "basePrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "courseDiscountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "courseDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "finalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ****************************************************************************
-- PART 6 — Duplicate-pending-request protection at database level.
-- Prisma cannot express conditional unique constraints, so a partial unique
-- index enforces "at most one PENDING request per (student, course)".
-- Pre-check: if legacy data already contains duplicate PENDING requests, the
-- migration FAILS with the SQL needed to locate them. Duplicates are never
-- silently resolved (no merging, no deleting, no auto-approval).
-- ****************************************************************************
DO $$
DECLARE
  v_dup_groups int;
  v_detail     text;
  r            record;
BEGIN
  SELECT count(*) INTO v_dup_groups
  FROM (
    SELECT "studentId", "courseId"
    FROM "SubscriptionRequest"
    WHERE "status" = 'PENDING'
    GROUP BY "studentId", "courseId"
    HAVING count(*) > 1
  ) d;

  IF v_dup_groups = 0 THEN
    RETURN;
  END IF;

  v_detail := '';
  FOR r IN
    SELECT r2."studentId",
           r2."courseId",
           count(*) AS "pendingCount",
           string_agg(r2."id", ', ' ORDER BY r2."createdAt") AS "requestIds"
    FROM "SubscriptionRequest" r2
    WHERE r2."status" = 'PENDING'
    GROUP BY r2."studentId", r2."courseId"
    HAVING count(*) > 1
    ORDER BY "pendingCount" DESC
    LIMIT 10
  LOOP
    v_detail := v_detail || format(
      E'\n  studentId=%s | courseId=%s | pendingCount=%s | requestIds=%s',
      r."studentId", r."courseId", r."pendingCount", r."requestIds"
    );
  END LOOP;

  RAISE EXCEPTION '%', concat(
    $msg$SubscriptionRequest duplicate-pending protection: $msg$,
    v_dup_groups,
    $msg$ (studentId, courseId) group(s) already have more than one PENDING request, so creating the partial unique index would fail. Resolve the duplicates manually (decide which request to keep; do NOT silently delete, merge or approve), then re-run the migration.

Offending groups (first 10):$msg$,
    v_detail,
    $msg$

Diagnostic query (all rows of duplicated PENDING requests):
SELECT r."id", r."studentId", r."courseId", r."status", r."createdAt"
FROM "SubscriptionRequest" r
JOIN (
  SELECT "studentId", "courseId"
  FROM "SubscriptionRequest"
  WHERE "status" = 'PENDING'
  GROUP BY "studentId", "courseId"
  HAVING count(*) > 1
) d ON d."studentId" = r."studentId" AND d."courseId" = r."courseId"
WHERE r."status" = 'PENDING'
ORDER BY r."studentId", r."courseId", r."createdAt";$msg$
  );
END $$;

CREATE UNIQUE INDEX "SubscriptionRequest_studentId_courseId_pending_key"
ON "SubscriptionRequest"("studentId", "courseId")
WHERE "status" = 'PENDING';
