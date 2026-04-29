-- Add optional university targeting to notifications
ALTER TABLE "Notification"
ADD COLUMN IF NOT EXISTS "universityId" TEXT;

ALTER TABLE "Notification"
ALTER COLUMN "collegeId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "Notification_universityId_idx"
ON "Notification"("universityId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Notification_universityId_fkey'
  ) THEN
    ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_universityId_fkey"
    FOREIGN KEY ("universityId") REFERENCES "University"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Add optional guest selected year
ALTER TABLE "GuestPreference"
ADD COLUMN IF NOT EXISTS "collegeYearId" TEXT;

CREATE INDEX IF NOT EXISTS "GuestPreference_collegeYearId_idx"
ON "GuestPreference"("collegeYearId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'GuestPreference_collegeYearId_fkey'
  ) THEN
    ALTER TABLE "GuestPreference"
    ADD CONSTRAINT "GuestPreference_collegeYearId_fkey"
    FOREIGN KEY ("collegeYearId") REFERENCES "CollegeYear"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Mark one active season for homepage filtering
ALTER TABLE "Season"
ADD COLUMN IF NOT EXISTS "isHomeActive" BOOLEAN NOT NULL DEFAULT false;

