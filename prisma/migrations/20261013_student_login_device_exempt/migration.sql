-- Student accounts that may sign in and play videos on any device (test
-- accounts). Managed with PATCH /v2/admins/students/:studentId/login-device-exempt.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginDeviceExempt" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User"
SET "loginDeviceExempt" = true
WHERE "userableType" = 'STUDENT'
  AND "phone" IN ('0968045022', '0968045822');
