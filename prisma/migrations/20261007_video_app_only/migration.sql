ALTER TABLE "StudentDevice"
ADD COLUMN IF NOT EXISTS "videoPublicKey" TEXT,
ADD COLUMN IF NOT EXISTS "videoKeyAlgorithm" TEXT,
ADD COLUMN IF NOT EXISTS "videoKeyCreatedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "videoKeyVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "VideoPlaybackChallenge" (
  "id" TEXT NOT NULL,
  "challengeHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "VideoPlaybackChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VideoPlaybackChallenge_userId_videoId_deviceId_idx" ON "VideoPlaybackChallenge"("userId", "videoId", "deviceId");
CREATE INDEX IF NOT EXISTS "VideoPlaybackChallenge_expiresAt_idx" ON "VideoPlaybackChallenge"("expiresAt");
CREATE INDEX IF NOT EXISTS "VideoPlaybackChallenge_usedAt_idx" ON "VideoPlaybackChallenge"("usedAt");

CREATE TABLE IF NOT EXISTS "VideoPlaybackSession" (
  "id" TEXT NOT NULL,
  "accessTokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "bunnyVideoId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refreshedAt" TIMESTAMP(3),
  CONSTRAINT "VideoPlaybackSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VideoPlaybackSession_accessTokenHash_key" ON "VideoPlaybackSession"("accessTokenHash");
CREATE INDEX IF NOT EXISTS "VideoPlaybackSession_userId_deviceId_idx" ON "VideoPlaybackSession"("userId", "deviceId");
CREATE INDEX IF NOT EXISTS "VideoPlaybackSession_videoId_idx" ON "VideoPlaybackSession"("videoId");
CREATE INDEX IF NOT EXISTS "VideoPlaybackSession_bunnyVideoId_idx" ON "VideoPlaybackSession"("bunnyVideoId");
CREATE INDEX IF NOT EXISTS "VideoPlaybackSession_expiresAt_idx" ON "VideoPlaybackSession"("expiresAt");
CREATE INDEX IF NOT EXISTS "VideoPlaybackSession_revokedAt_idx" ON "VideoPlaybackSession"("revokedAt");

DO $$ BEGIN
  ALTER TABLE "VideoPlaybackSession" ADD CONSTRAINT "VideoPlaybackSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "VideoPlaybackSession" ADD CONSTRAINT "VideoPlaybackSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "VideoPlaybackSession" ADD CONSTRAINT "VideoPlaybackSession_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
