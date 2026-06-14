ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "deletedPhone" TEXT,
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "Teacher"
ADD COLUMN IF NOT EXISTS "isVisibleToStudents" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Teacher" AS teacher
SET "isVisibleToStudents" = EXISTS (
  SELECT 1
  FROM "User" AS account
  WHERE account."userableType" = 'TEACHER'
    AND account."userableId" = teacher."id"
    AND account."status" = 'active'
);
