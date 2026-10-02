/*
  Warnings:

  - You are about to drop the column `isUpcoming` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `nextCourseId` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `prerequisiteCourseId` on the `Course` table. All the data in the column will be lost.
  - Added the required column `universityId` to the `PointOfSale` table without a default value. This is not possible if the table is not empty.

*/
-- Ensure PointOfSale exists for shadow DB apply order
CREATE TABLE IF NOT EXISTS "PointOfSale" (
  "id" BIGSERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "image" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PointOfSale_pkey" PRIMARY KEY ("id")
);

-- AlterEnum
ALTER TYPE "CourseType" ADD VALUE 'PROGRAM';

-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_nextCourseId_fkey";

-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_prerequisiteCourseId_fkey";

-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_seasonId_fkey";

-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_yearId_fkey";

-- DropIndex
DROP INDEX "Course_nextCourseId_idx";

-- DropIndex
DROP INDEX "Course_prerequisiteCourseId_idx";

-- AlterTable
ALTER TABLE "Course" DROP COLUMN "isUpcoming",
DROP COLUMN "nextCourseId",
DROP COLUMN "prerequisiteCourseId",
ALTER COLUMN "subjectId" DROP NOT NULL,
ALTER COLUMN "yearId" DROP NOT NULL,
ALTER COLUMN "seasonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PointOfSale" ADD COLUMN     "universityId" BIGINT NOT NULL;

-- CreateIndex
CREATE INDEX "PointOfSale_universityId_idx" ON "PointOfSale"("universityId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSale" ADD CONSTRAINT "PointOfSale_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
