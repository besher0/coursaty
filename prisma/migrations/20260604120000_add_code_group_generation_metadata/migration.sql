-- Keep this idempotent so databases with migration drift also get the missing column.
ALTER TABLE "CodeGroup"
ADD COLUMN IF NOT EXISTS "isPrinted" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CodeGroup"
ADD COLUMN IF NOT EXISTS "prefix" TEXT,
ADD COLUMN IF NOT EXISTS "validForDays" INTEGER,
ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "usageLimit" INTEGER;
