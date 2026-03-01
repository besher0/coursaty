-- Add lectureId to Question
ALTER TABLE "Question" ADD COLUMN "lectureId" BIGINT;

-- Backfill lectureId from Automation
UPDATE "Question" q
SET "lectureId" = a."lectureId"
FROM "Automation" a
WHERE q."automationId" = a."id";

-- Make lectureId required
ALTER TABLE "Question" ALTER COLUMN "lectureId" SET NOT NULL;

-- Drop old FK and column to Automation
ALTER TABLE "Question" DROP CONSTRAINT IF EXISTS "Question_automationId_fkey";
ALTER TABLE "Question" DROP COLUMN IF EXISTS "automationId";

-- Drop Automation table
DROP TABLE IF EXISTS "Automation";

-- Index and FK for lectureId
CREATE INDEX "Question_lectureId_idx" ON "Question"("lectureId");
ALTER TABLE "Question" ADD CONSTRAINT "Question_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "Lecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
