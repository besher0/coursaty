-- Align Advertisement table with Prisma model target scopes.
ALTER TABLE "Advertisement"
ADD COLUMN IF NOT EXISTS "universityId" BIGINT,
ADD COLUMN IF NOT EXISTS "departmentId" BIGINT;

-- Allow global and university-level ads without a required college.
ALTER TABLE "Advertisement"
ALTER COLUMN "collegeId" DROP NOT NULL;

-- Backfill university scope for existing college-scoped ads.
UPDATE "Advertisement" AS a
SET "universityId" = c."universityId"
FROM "College" AS c
WHERE a."collegeId" = c."id"
  AND a."universityId" IS NULL;

CREATE INDEX IF NOT EXISTS "Advertisement_universityId_idx"
ON "Advertisement"("universityId");

CREATE INDEX IF NOT EXISTS "Advertisement_departmentId_idx"
ON "Advertisement"("departmentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Advertisement_universityId_fkey'
  ) THEN
    ALTER TABLE "Advertisement"
    ADD CONSTRAINT "Advertisement_universityId_fkey"
    FOREIGN KEY ("universityId") REFERENCES "University"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Advertisement_departmentId_fkey'
  ) THEN
    ALTER TABLE "Advertisement"
    ADD CONSTRAINT "Advertisement_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
