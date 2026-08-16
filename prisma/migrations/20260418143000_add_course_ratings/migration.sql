-- Add table for direct course ratings by subscribed students.
CREATE TABLE IF NOT EXISTS "CourseRating" (
  "id" TEXT NOT NULL,
  "courseId" BIGINT NOT NULL,
  "studentId" BIGINT NOT NULL,
  "rating" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CourseRating_courseId_studentId_key"
ON "CourseRating"("courseId", "studentId");

CREATE INDEX IF NOT EXISTS "CourseRating_courseId_idx"
ON "CourseRating"("courseId");

CREATE INDEX IF NOT EXISTS "CourseRating_studentId_idx"
ON "CourseRating"("studentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CourseRating_courseId_fkey'
  ) THEN
    ALTER TABLE "CourseRating"
    ADD CONSTRAINT "CourseRating_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CourseRating_studentId_fkey'
  ) THEN
    ALTER TABLE "CourseRating"
    ADD CONSTRAINT "CourseRating_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
