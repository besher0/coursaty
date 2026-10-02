-- Add sortOrder for course content ordering
ALTER TABLE "Video"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER;

ALTER TABLE "LectureFile"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER;

CREATE INDEX IF NOT EXISTS "Video_sortOrder_idx"
ON "Video"("sortOrder");

CREATE INDEX IF NOT EXISTS "LectureFile_sortOrder_idx"
ON "LectureFile"("sortOrder");