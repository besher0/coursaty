-- Allow a student to return to a previous university/college while keeping
-- historical StudentEnrollment rows.
--
-- The old index enforced uniqueness across ALL history rows:
--   (universityId, collegeId, universityNumber)
-- which blocked creating a new active enrollment when an inactive historical
-- row already had the same scoped university number.
--
-- The business rule is uniqueness among ACTIVE enrollments only.

BEGIN;

DROP INDEX IF EXISTS "StudentEnrollment_universityId_collegeId_universityNumber_key";

CREATE UNIQUE INDEX "StudentEnrollment_active_university_college_number_key"
ON "StudentEnrollment"("universityId", "collegeId", "universityNumber")
WHERE "isActive" = true
  AND "universityNumber" IS NOT NULL;

COMMIT;
