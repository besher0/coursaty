/*
  Warnings:

  - A unique constraint covering the columns `[universityNumber]` on the table `Student` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Code" ADD COLUMN     "allowedUniversityNumber" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "universityNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Student_universityNumber_key" ON "Student"("universityNumber");
