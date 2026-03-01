-- AlterTable
ALTER TABLE "Course" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LectureFile" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Video" ADD COLUMN "isFree" BOOLEAN NOT NULL DEFAULT false;
