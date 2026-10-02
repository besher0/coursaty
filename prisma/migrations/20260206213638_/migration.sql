-- DropForeignKey
ALTER TABLE "CourseCategory" DROP CONSTRAINT IF EXISTS "CourseCategory_collegeId_fkey";

-- AddForeignKey
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'CourseCategory'
			AND column_name = 'collegeId'
	) THEN
		ALTER TABLE "CourseCategory"
			ADD CONSTRAINT "CourseCategory_collegeId_fkey"
			FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE SET NULL ON UPDATE CASCADE;
	END IF;
END $$;
