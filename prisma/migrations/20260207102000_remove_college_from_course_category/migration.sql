-- DropForeignKey
ALTER TABLE "CourseCategory" DROP CONSTRAINT IF EXISTS "CourseCategory_collegeId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "CourseCategory_collegeId_idx";
DROP INDEX IF EXISTS "CourseCategory_collegeId_name_key";

-- AlterTable
ALTER TABLE "CourseCategory" DROP COLUMN IF EXISTS "collegeId";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CourseCategory_name_key" ON "CourseCategory"("name");
