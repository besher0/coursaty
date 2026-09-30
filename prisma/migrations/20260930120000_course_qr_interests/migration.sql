CREATE TYPE "CourseInterestSource" AS ENUM ('QR_SCREENSHOT', 'MANUAL');

ALTER TABLE "Course"
ADD COLUMN "paymentQrUrl" TEXT;

CREATE TABLE "StudentCourseInterest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "source" "CourseInterestSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCourseInterest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentCourseInterest_studentId_courseId_key"
ON "StudentCourseInterest"("studentId", "courseId");

CREATE INDEX "StudentCourseInterest_studentId_createdAt_idx"
ON "StudentCourseInterest"("studentId", "createdAt");

CREATE INDEX "StudentCourseInterest_courseId_idx"
ON "StudentCourseInterest"("courseId");

ALTER TABLE "StudentCourseInterest"
ADD CONSTRAINT "StudentCourseInterest_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentCourseInterest"
ADD CONSTRAINT "StudentCourseInterest_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
