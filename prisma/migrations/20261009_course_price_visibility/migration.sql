-- Display flag for the course price. Defaults to true so existing courses keep
-- showing their price.
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "isPriceVisible" BOOLEAN NOT NULL DEFAULT true;
