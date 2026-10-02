-- Create table to persist guest browsing preferences by device id.
CREATE TABLE IF NOT EXISTS "GuestPreference" (
  "id" TEXT NOT NULL,
  "deviceId" BIGINT NOT NULL,
  "universityId" BIGINT NOT NULL,
  "collegeId" BIGINT NOT NULL,
  "departmentId" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GuestPreference_deviceId_key"
ON "GuestPreference"("deviceId");

CREATE INDEX IF NOT EXISTS "GuestPreference_universityId_idx"
ON "GuestPreference"("universityId");

CREATE INDEX IF NOT EXISTS "GuestPreference_collegeId_idx"
ON "GuestPreference"("collegeId");

CREATE INDEX IF NOT EXISTS "GuestPreference_departmentId_idx"
ON "GuestPreference"("departmentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'GuestPreference_universityId_fkey'
  ) THEN
    ALTER TABLE "GuestPreference"
    ADD CONSTRAINT "GuestPreference_universityId_fkey"
    FOREIGN KEY ("universityId") REFERENCES "University"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'GuestPreference_collegeId_fkey'
  ) THEN
    ALTER TABLE "GuestPreference"
    ADD CONSTRAINT "GuestPreference_collegeId_fkey"
    FOREIGN KEY ("collegeId") REFERENCES "College"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'GuestPreference_departmentId_fkey'
  ) THEN
    ALTER TABLE "GuestPreference"
    ADD CONSTRAINT "GuestPreference_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
