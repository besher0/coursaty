-- Backfill User gender from Student if user is a student
UPDATE "User" u
SET "gender" = s."gender"
FROM "Student" s
WHERE u."userableId" = s.id 
  AND u."userableType" = 'STUDENT'
  AND u."gender" IS NULL;
