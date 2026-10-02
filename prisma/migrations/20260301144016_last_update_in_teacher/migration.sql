/*
  Warnings:

  - You are about to drop the column `teacherPercentage` on the `Teacher` table. All the data in the column will be lost.
  - You are about to drop the column `universityId` on the `Teacher` table. All the data in the column will be lost.
  - Added the required column `basePrice` to the `StudentSubscription` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "Teacher" DROP CONSTRAINT "Teacher_universityId_fkey";

-- DropIndex
DROP INDEX "CollegeYear_collegeId_departmentId_academicYearId_key";

-- DropIndex
DROP INDEX "Teacher_universityId_idx";

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" BIGINT,
ADD COLUMN     "courseDiscountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "departmentId" BIGINT,
ADD COLUMN     "status" "CourseStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "teacherPercentage" DECIMAL(65,30) NOT NULL DEFAULT 0.0;

-- AlterTable
ALTER TABLE "StudentSubscription" ADD COLUMN     "basePrice" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "codeDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "courseDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "Teacher" DROP COLUMN "teacherPercentage",
DROP COLUMN "universityId";

-- CreateTable
CREATE TABLE "TeacherAffiliation" (
    "id" BIGSERIAL NOT NULL,
    "teacherId" BIGINT NOT NULL,
    "universityId" BIGINT NOT NULL,
    "collegeId" BIGINT NOT NULL,
    "departmentId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherAffiliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherAffiliation_teacherId_idx" ON "TeacherAffiliation"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherAffiliation_universityId_idx" ON "TeacherAffiliation"("universityId");

-- CreateIndex
CREATE INDEX "TeacherAffiliation_collegeId_idx" ON "TeacherAffiliation"("collegeId");

-- CreateIndex
CREATE INDEX "TeacherAffiliation_departmentId_idx" ON "TeacherAffiliation"("departmentId");

-- CreateIndex
CREATE INDEX "Course_departmentId_idx" ON "Course"("departmentId");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Course_approvedById_idx" ON "Course"("approvedById");

-- AddForeignKey
ALTER TABLE "TeacherAffiliation" ADD CONSTRAINT "TeacherAffiliation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAffiliation" ADD CONSTRAINT "TeacherAffiliation_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAffiliation" ADD CONSTRAINT "TeacherAffiliation_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherAffiliation" ADD CONSTRAINT "TeacherAffiliation_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
