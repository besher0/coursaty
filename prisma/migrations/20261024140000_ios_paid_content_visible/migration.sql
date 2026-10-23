-- iPhone app: whether paid content is shown at all (admin setting, hidden by default).
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "iosPaidContentVisible" BOOLEAN NOT NULL DEFAULT false;
