-- Second id of a student's bound phone, independent of the app signing key
-- (see User.loginDeviceAltId and auth/student-device-lock.ts).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginDeviceAltId" TEXT;
