ALTER TABLE "Video"
ADD COLUMN IF NOT EXISTS "bunnyVideoId" TEXT,
ADD COLUMN IF NOT EXISTS "contentVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "offlineDownloadEnabled" BOOLEAN NOT NULL DEFAULT true;

WITH extracted AS (
  SELECT
    "id",
    substring(
      "videoUrl"
      FROM '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'
    ) AS "bunnyVideoId"
  FROM "Video"
  WHERE "bunnyVideoId" IS NULL
),
deduped AS (
  SELECT
    "id",
    "bunnyVideoId",
    row_number() OVER (PARTITION BY lower("bunnyVideoId") ORDER BY "id") AS rn
  FROM extracted
  WHERE "bunnyVideoId" IS NOT NULL
)
UPDATE "Video" v
SET "bunnyVideoId" = d."bunnyVideoId"
FROM deduped d
WHERE v."id" = d."id"
  AND d.rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Video_bunnyVideoId_key" ON "Video"("bunnyVideoId");
CREATE INDEX IF NOT EXISTS "Video_bunnyVideoId_idx" ON "Video"("bunnyVideoId");

CREATE TABLE IF NOT EXISTS "StudentDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "StudentDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudentDevice_userId_deviceId_key" ON "StudentDevice"("userId", "deviceId");
CREATE INDEX IF NOT EXISTS "StudentDevice_studentId_idx" ON "StudentDevice"("studentId");
CREATE INDEX IF NOT EXISTS "StudentDevice_deviceId_idx" ON "StudentDevice"("deviceId");
CREATE INDEX IF NOT EXISTS "StudentDevice_revokedAt_idx" ON "StudentDevice"("revokedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentDevice_userId_fkey'
  ) THEN
    ALTER TABLE "StudentDevice"
    ADD CONSTRAINT "StudentDevice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StudentDevice_studentId_fkey'
  ) THEN
    ALTER TABLE "StudentDevice"
    ADD CONSTRAINT "StudentDevice_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OfflineVideoLicense" (
  "id" TEXT NOT NULL,
  "downloadSessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "lectureId" TEXT NOT NULL,
  "contentVersion" INTEGER NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfflineVideoLicense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OfflineVideoLicense_downloadSessionId_key" ON "OfflineVideoLicense"("downloadSessionId");
CREATE INDEX IF NOT EXISTS "OfflineVideoLicense_userId_deviceId_idx" ON "OfflineVideoLicense"("userId", "deviceId");
CREATE INDEX IF NOT EXISTS "OfflineVideoLicense_studentId_idx" ON "OfflineVideoLicense"("studentId");
CREATE INDEX IF NOT EXISTS "OfflineVideoLicense_videoId_idx" ON "OfflineVideoLicense"("videoId");
CREATE INDEX IF NOT EXISTS "OfflineVideoLicense_courseId_idx" ON "OfflineVideoLicense"("courseId");
CREATE INDEX IF NOT EXISTS "OfflineVideoLicense_lectureId_idx" ON "OfflineVideoLicense"("lectureId");
CREATE INDEX IF NOT EXISTS "OfflineVideoLicense_expiresAt_idx" ON "OfflineVideoLicense"("expiresAt");
CREATE INDEX IF NOT EXISTS "OfflineVideoLicense_revokedAt_idx" ON "OfflineVideoLicense"("revokedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OfflineVideoLicense_userId_fkey'
  ) THEN
    ALTER TABLE "OfflineVideoLicense"
    ADD CONSTRAINT "OfflineVideoLicense_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OfflineVideoLicense_studentId_fkey'
  ) THEN
    ALTER TABLE "OfflineVideoLicense"
    ADD CONSTRAINT "OfflineVideoLicense_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OfflineVideoLicense_videoId_fkey'
  ) THEN
    ALTER TABLE "OfflineVideoLicense"
    ADD CONSTRAINT "OfflineVideoLicense_videoId_fkey"
    FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OfflineVideoLicense_courseId_fkey'
  ) THEN
    ALTER TABLE "OfflineVideoLicense"
    ADD CONSTRAINT "OfflineVideoLicense_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OfflineVideoLicense_lectureId_fkey'
  ) THEN
    ALTER TABLE "OfflineVideoLicense"
    ADD CONSTRAINT "OfflineVideoLicense_lectureId_fkey"
    FOREIGN KEY ("lectureId") REFERENCES "Lecture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
