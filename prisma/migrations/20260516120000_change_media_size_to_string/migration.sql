-- Change size columns from INTEGER to TEXT
ALTER TABLE "Video" ALTER COLUMN "size" TYPE TEXT USING ("size"::text);
ALTER TABLE "LectureFile" ALTER COLUMN "size" TYPE TEXT USING ("size"::text);
