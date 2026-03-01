/*
  Warnings:

  - You are about to drop the column `yearId` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `yearId` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `yearId` on the `Subject` table. All the data in the column will be lost.
  - You are about to drop the `Year` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `provinceId` to the `PointOfSale` table without a default value. This is not possible if the table is not empty.
  - Added the required column `collegeYearId` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provinceId` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `provinceId` to the `University` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Course" DROP CONSTRAINT "Course_yearId_fkey";

-- DropForeignKey
ALTER TABLE "Student" DROP CONSTRAINT "Student_yearId_fkey";

-- DropForeignKey
ALTER TABLE "Subject" DROP CONSTRAINT "Subject_yearId_fkey";

-- DropForeignKey
ALTER TABLE "Year" DROP CONSTRAINT "Year_collegeId_fkey";

-- DropForeignKey
ALTER TABLE "Year" DROP CONSTRAINT "Year_departmentId_fkey";

-- DropIndex
DROP INDEX "Course_yearId_idx";

-- DropIndex
DROP INDEX "Subject_yearId_idx";

-- AlterTable
ALTER TABLE "Course" DROP COLUMN "yearId",
ADD COLUMN     "collegeYearId" BIGINT;

-- AlterTable
ALTER TABLE "PointOfSale" ADD COLUMN     "provinceId" BIGINT NOT NULL;

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "yearId",
ADD COLUMN     "collegeYearId" BIGINT NOT NULL,
ADD COLUMN     "provinceId" BIGINT NOT NULL;

-- AlterTable
ALTER TABLE "Subject" DROP COLUMN "yearId",
ADD COLUMN     "collegeYearId" BIGINT,
ADD COLUMN     "isProgram" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "universityId" BIGINT;

-- AlterTable
ALTER TABLE "University" ADD COLUMN     "provinceId" BIGINT NOT NULL;

-- DropTable
DROP TABLE "Year";

-- CreateTable
CREATE TABLE "Province" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" BIGSERIAL NOT NULL,
    "yearNumber" INTEGER NOT NULL,
    "yearName" TEXT NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollegeYear" (
    "id" BIGSERIAL NOT NULL,
    "collegeId" BIGINT NOT NULL,
    "departmentId" BIGINT,
    "academicYearId" BIGINT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CollegeYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSegment" (
    "id" BIGSERIAL NOT NULL,
    "videoId" BIGINT NOT NULL,
    "segmentName" TEXT NOT NULL,
    "startSeconds" INTEGER NOT NULL,
    "endSeconds" INTEGER NOT NULL,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherSubjectPermission" (
    "teacherId" BIGINT NOT NULL,
    "subjectId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherSubjectPermission_pkey" PRIMARY KEY ("teacherId","subjectId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Province_name_key" ON "Province"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_yearNumber_key" ON "AcademicYear"("yearNumber");

-- CreateIndex
CREATE INDEX "CollegeYear_collegeId_idx" ON "CollegeYear"("collegeId");

-- CreateIndex
CREATE INDEX "CollegeYear_departmentId_idx" ON "CollegeYear"("departmentId");

-- CreateIndex
CREATE INDEX "CollegeYear_academicYearId_idx" ON "CollegeYear"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "CollegeYear_collegeId_departmentId_academicYearId_key" ON "CollegeYear"("collegeId", "departmentId", "academicYearId");

-- CreateIndex
CREATE INDEX "VideoSegment_videoId_idx" ON "VideoSegment"("videoId");

-- CreateIndex
CREATE INDEX "VideoSegment_startSeconds_endSeconds_idx" ON "VideoSegment"("startSeconds", "endSeconds");

-- CreateIndex
CREATE INDEX "TeacherSubjectPermission_subjectId_idx" ON "TeacherSubjectPermission"("subjectId");

-- CreateIndex
CREATE INDEX "Course_collegeYearId_idx" ON "Course"("collegeYearId");

-- CreateIndex
CREATE INDEX "PointOfSale_provinceId_idx" ON "PointOfSale"("provinceId");

-- CreateIndex
CREATE INDEX "Student_provinceId_idx" ON "Student"("provinceId");

-- CreateIndex
CREATE INDEX "Student_collegeYearId_idx" ON "Student"("collegeYearId");

-- CreateIndex
CREATE INDEX "StudentSubscription_createdAt_idx" ON "StudentSubscription"("createdAt");

-- CreateIndex
CREATE INDEX "Subject_collegeYearId_idx" ON "Subject"("collegeYearId");

-- CreateIndex
CREATE INDEX "Teacher_universityId_idx" ON "Teacher"("universityId");

-- CreateIndex
CREATE INDEX "University_provinceId_idx" ON "University"("provinceId");

-- CreateIndex
CREATE INDEX "VideoInteraction_rating_idx" ON "VideoInteraction"("rating");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_collegeYearId_fkey" FOREIGN KEY ("collegeYearId") REFERENCES "CollegeYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "University" ADD CONSTRAINT "University_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollegeYear" ADD CONSTRAINT "CollegeYear_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollegeYear" ADD CONSTRAINT "CollegeYear_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollegeYear" ADD CONSTRAINT "CollegeYear_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_collegeYearId_fkey" FOREIGN KEY ("collegeYearId") REFERENCES "CollegeYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_collegeYearId_fkey" FOREIGN KEY ("collegeYearId") REFERENCES "CollegeYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSegment" ADD CONSTRAINT "VideoSegment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubjectPermission" ADD CONSTRAINT "TeacherSubjectPermission_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubjectPermission" ADD CONSTRAINT "TeacherSubjectPermission_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOfSale" ADD CONSTRAINT "PointOfSale_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
