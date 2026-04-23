-- Make PointOfSale linked to Province only.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PointOfSale_universityId_fkey'
  ) THEN
    ALTER TABLE "PointOfSale" DROP CONSTRAINT "PointOfSale_universityId_fkey";
  END IF;
END $$;

DROP INDEX IF EXISTS "PointOfSale_universityId_idx";

ALTER TABLE "PointOfSale"
DROP COLUMN IF EXISTS "universityId";
