-- Backfill collegeId for Year and Subject from Department
UPDATE "Year" y
SET "collegeId" = d."collegeId"
FROM "Department" d
WHERE y."departmentId" = d.id AND y."collegeId" IS NULL;

UPDATE "Subject" s
SET "collegeId" = d."collegeId"
FROM "Department" d
WHERE s."departmentId" = d.id AND s."collegeId" IS NULL;
