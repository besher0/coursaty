-- Students may sign in from one device only: the device the account was
-- created on, or for older accounts the first device that signs in.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginDeviceId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginDeviceBoundAt" TIMESTAMP(3);
