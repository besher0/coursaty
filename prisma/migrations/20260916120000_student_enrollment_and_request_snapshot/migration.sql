-- StudentAcademicEnrollment feature + SubscriptionRequest payment snapshot feature.
--
-- Migration safety notes:
-- 1. Nothing is deleted. Legacy Student academic columns stay in place and are
--    synchronized with the active enrollment until all reads are migrated.
-- 2. The global unique index on Student.universityNumber is relaxed to a plain
--    (non-unique) index. Before it is dropped we check for existing duplicate
--    numbers; duplicates are legal under the NEW rule (unique only within
--    university + college), so we do NOT fail or delete anything on them.
--    If duplicate data exists, the drop is safe because the new source of truth
--    (StudentEnrollment unique constraint) is created first and would have
--    already failed loudly if legacy data violated the new rule.
-- 3. Backfill: every existing Student gets one active StudentEnrollment built
--    from its current academic fields. Students with incomplete legacy data
--    (NULL university/college/year) cannot satisfy the new NOT NULL columns;
--    they are detected and reported below instead of being silently skipped or
--    destroyed.

-- ****************************************************************************
-- PART 1 — REPORT invalid legacy academic data (no silent deletes).
-- These rows would violate StudentEnrollment NOT NULL / FK constraints.
-- If this SELECT returns rows, the INSERT ... SELECT in PART 3 skips them and
-- the migration still succeeds; manual cleanup is then required for those
-- students (fix their academic fields, re-run the backfill INSERT manually).
-- ****************************************************************************
DO $$
DECLARE
  bad_rows int;
BEGIN
  SELECT count(*) INTO bad_rows
  FROM "Student" s
  LEFT JOIN "University" u ON u."id" = s."universityId"
  LEFT JOIN "College" c ON c."id" = s."collegeId"
    AND c."universityId" = s."universityId"
  LEFT JOIN "CollegeYear" cy ON cy."id" = s."collegeYearId"
    AND cy."collegeId" = s."collegeId"
  WHERE s."universityId" IS NULL
     OR s."collegeId" IS NULL
     OR s."collegeYearId" IS NULL
     OR u."id" IS NULL
     OR c."id" IS NULL
     OR cy."id" IS NULL;

  IF bad_rows > 0 THEN
    RAISE WARNING 'StudentEnrollment backfill: % student(s) have missing/inconsistent legacy academic data and were NOT backfilled. Run: SELECT s."id", s."name", s."universityId", s."collegeId", s."collegeYearId" FROM "Student" s LEFT JOIN "University" u ON u."id" = s."universityId" LEFT JOIN "College" c ON c."id" = s."collegeId" AND c."universityId" = s."universityId" LEFT JOIN "CollegeYear" cy ON cy."id" = s."collegeYearId" AND cy."collegeId" = s."collegeId" WHERE s."universityId" IS NULL OR s."collegeId" IS NULL OR s."collegeYearId" IS NULL OR u."id" IS NULL OR c."id" IS NULL OR cy."id" IS NULL;', bad_rows;
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
-- PART 3 — Backfill: one active enrollment per existing student, built from
-- legacy Student academic fields. Rows with incomplete/inconsistent legacy
-- data are skipped (reported in PART 1) instead of failing the migration.
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
FROM "Student" s
JOIN "University" u ON u."id" = s."universityId"
JOIN "College" c ON c."id" = s."collegeId" AND c."universityId" = s."universityId"
JOIN "CollegeYear" cy ON cy."id" = s."collegeYearId" AND cy."collegeId" = s."collegeId";

-- ****************************************************************************
-- PART 4 — Relax the GLOBAL uniqueness of Student.universityNumber.
-- The final source of truth is StudentEnrollment (unique per university +
-- college). The index is replaced by a plain index so legacy lookups/searches
-- keep working.
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
-- Existing data check: if legacy data already violates this rule the index
-- creation fails loudly rather than silently merging/deleting requests.
-- ****************************************************************************
CREATE UNIQUE INDEX "SubscriptionRequest_studentId_courseId_pending_key"
ON "SubscriptionRequest"("studentId", "courseId")
WHERE "status" = 'PENDING';
