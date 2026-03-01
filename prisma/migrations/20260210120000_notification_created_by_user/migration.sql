/*
  Warnings:

  - You are about to drop the column `teacherId` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the index `Notification_teacherId_idx` on the `Notification` table.
  - Added the required column `createdById` to the `Notification` table without a default value. This is not possible if the table is not empty.

*/

-- Step 1: Add the new column as nullable first
ALTER TABLE "Notification" ADD COLUMN "createdById" BIGINT;

-- Step 2: Migrate existing data - find User.id for each teacher
-- Update createdById to User.id where User.userableType = 'TEACHER' and User.userableId = old teacherId
UPDATE "Notification" 
SET "createdById" = "User"."id"
FROM "User"
WHERE "User"."userableType" = 'TEACHER' 
  AND "User"."userableId" = "Notification"."teacherId";

-- Step 3: Drop old foreign key and column
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_teacherId_fkey";
ALTER TABLE "Notification" DROP COLUMN IF EXISTS "teacherId";

-- Step 4: Make createdById NOT NULL (all rows should have values now)
ALTER TABLE "Notification" ALTER COLUMN "createdById" SET NOT NULL;

-- Step 5: Drop old index
DROP INDEX IF EXISTS "Notification_teacherId_idx";

-- Step 6: Create new index
CREATE INDEX "Notification_createdById_idx" ON "Notification"("createdById");

-- Step 7: Add new foreign key
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
