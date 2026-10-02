-- AlterTable
ALTER TABLE "CourseCategory" ADD COLUMN "collegeId" BIGINT;

-- DropIndex
DROP INDEX "CourseCategory_name_key";

-- CreateIndex
CREATE INDEX "CourseCategory_collegeId_idx" ON "CourseCategory"("collegeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCategory_collegeId_name_key" ON "CourseCategory"("collegeId", "name");

-- AddForeignKey
ALTER TABLE "CourseCategory" ADD CONSTRAINT "CourseCategory_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
