-- Allow advertisements without image and add optional video URL.
ALTER TABLE "Advertisement"
ALTER COLUMN "imageUrl" DROP NOT NULL;

ALTER TABLE "Advertisement"
ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;

-- Add printing flag to code groups with safe backfill.
ALTER TABLE "CodeGroup"
ADD COLUMN IF NOT EXISTS "isForPrinting" BOOLEAN;

UPDATE "CodeGroup"
SET "isForPrinting" = FALSE
WHERE "isForPrinting" IS NULL;

ALTER TABLE "CodeGroup"
ALTER COLUMN "isForPrinting" SET DEFAULT FALSE,
ALTER COLUMN "isForPrinting" SET NOT NULL;
