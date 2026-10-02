-- Backfill Student universityId and collegeId from Department -> College -> University
UPDATE "Student" s
SET "collegeId" = d."collegeId",
    "universityId" = c."universityId"
FROM "Department" d
JOIN "College" c ON c.id = d."collegeId"
WHERE s."departmentId" = d.id
  AND (s."collegeId" IS NULL OR s."universityId" IS NULL);

-- Ensure gender is set for any existing rows (default already applies for new rows)
UPDATE "Student" s
SET "gender" = 'MALE'
WHERE s."gender" IS NULL;
