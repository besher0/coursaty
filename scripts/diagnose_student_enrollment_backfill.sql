-- ============================================================================
-- Diagnostic queries for the StudentEnrollment legacy backfill
-- (prisma/migrations/20260916120000_student_enrollment_and_request_snapshot).
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/diagnose_student_enrollment_backfill.sql
--
-- Run these BEFORE applying the migration. The migration itself runs the same
-- checks and aborts with an error if anything returns rows, so this file is
-- for pre-flight inspection / investigating a failed run. It is read-only.
--
-- Output columns include: studentId, universityId, collegeId, departmentId,
-- collegeYearId, universityNumber, and the detected problem(s).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Query 1 — Students whose legacy academic data cannot back an initial active
-- StudentEnrollment, with the detected problem(s). Mirrors the hierarchy rules
-- enforced by EnrollmentsService.validateAcademicHierarchy:
--   - university exists
--   - college exists and belongs to the student's university
--   - department (when present) exists and belongs to the student's college
--   - collegeYear exists and belongs to the student's college
--   - department-specific collegeYear matches the student's department
-- CollegeYear.isActive is deliberately NOT checked: it is a rule for NEW
-- registrations / future academic changes, not for migrating historical
-- existing students, whose year may legitimately be inactive.
-- ---------------------------------------------------------------------------
SELECT * FROM (
  SELECT
    s."id"               AS "studentId",
    s."name"             AS "studentName",
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
ORDER BY "problem", "studentId";

-- ---------------------------------------------------------------------------
-- Query 2 — universityNumber duplicates under the NEW rule: unique only within
-- (universityId, collegeId, universityNumber). Global uniqueness is NOT
-- enforced anymore, so duplicates across different universities or colleges
-- are legal and intentionally not reported.
-- ---------------------------------------------------------------------------
SELECT
  s."universityId",
  s."collegeId",
  s."universityNumber",
  count(*)                         AS "studentCount",
  array_agg(s."id" ORDER BY s."id") AS "studentIds"
FROM "Student" s
WHERE s."universityNumber" IS NOT NULL
GROUP BY s."universityId", s."collegeId", s."universityNumber"
HAVING count(*) > 1
ORDER BY "studentCount" DESC, s."universityId", s."collegeId", s."universityNumber";

-- ---------------------------------------------------------------------------
-- Query 3 — Duplicate PENDING SubscriptionRequests per (studentId, courseId).
-- The migration's partial unique index would fail if these exist. Duplicates
-- must be resolved manually (never silently deleted/merged).
-- ---------------------------------------------------------------------------
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
ORDER BY r."studentId", r."courseId", r."createdAt";
