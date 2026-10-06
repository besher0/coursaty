ALTER TABLE "StudentDevice"
ADD COLUMN IF NOT EXISTS "previousDeviceId" TEXT,
ADD COLUMN IF NOT EXISTS "replacedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "StudentDevice_previousDeviceId_idx" ON "StudentDevice"("previousDeviceId");
CREATE INDEX IF NOT EXISTS "StudentDevice_replacedAt_idx" ON "StudentDevice"("replacedAt");
