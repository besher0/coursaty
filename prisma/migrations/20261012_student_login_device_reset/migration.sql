-- Admin reset of a student's login device also voids every session issued
-- before the reset, so the old phone cannot claim the account again.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginDeviceResetAt" TIMESTAMP(3);
