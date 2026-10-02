-- Restore technical support phone column on CustomerService.
ALTER TABLE "CustomerService"
ADD COLUMN IF NOT EXISTS "technicalSupportPhone" TEXT;

UPDATE "CustomerService"
SET "technicalSupportPhone" = "contactSupportPhone"
WHERE "technicalSupportPhone" IS NULL;

ALTER TABLE "CustomerService"
ALTER COLUMN "technicalSupportPhone" SET NOT NULL;
