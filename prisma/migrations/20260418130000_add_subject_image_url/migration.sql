-- Safe, non-destructive migration: adds a nullable image column for subjects/programs.
ALTER TABLE "Subject"
ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- Backfill existing rows from latest related course image when subject image is still null.
UPDATE "Subject" AS s
SET "imageUrl" = latest."imageUrl"
FROM (
  SELECT DISTINCT ON (c."subjectId")
    c."subjectId",
    c."imageUrl"
  FROM "Course" AS c
  WHERE c."subjectId" IS NOT NULL
    AND c."imageUrl" IS NOT NULL
  ORDER BY c."subjectId", c."createdAt" DESC
) AS latest
WHERE s."id" = latest."subjectId"
  AND s."imageUrl" IS NULL;
