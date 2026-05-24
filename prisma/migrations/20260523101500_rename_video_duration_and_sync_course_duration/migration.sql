-- Rename old video duration column to the requested name
ALTER TABLE "Video" RENAME COLUMN "durationSeconds" TO "duration";

-- Ensure video duration is always an integer value in seconds
UPDATE "Video" SET "duration" = 0 WHERE "duration" IS NULL;
ALTER TABLE "Video" ALTER COLUMN "duration" SET DEFAULT 0;
ALTER TABLE "Video" ALTER COLUMN "duration" SET NOT NULL;

-- Course duration is now aggregated in seconds from related videos
ALTER TABLE "Course" ALTER COLUMN "duration" SET DEFAULT 0;
UPDATE "Course" SET "duration" = 0;

UPDATE "Course" AS c
SET "duration" = v.total_duration
FROM (
  SELECT
    l."courseId" AS course_id,
    COALESCE(SUM(v."duration"), 0)::INTEGER AS total_duration
  FROM "Lecture" AS l
  LEFT JOIN "Video" AS v ON v."lectureId" = l."id"
  GROUP BY l."courseId"
) AS v
WHERE c."id" = v.course_id;
