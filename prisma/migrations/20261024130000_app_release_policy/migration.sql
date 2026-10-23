-- Newest app release per platform and whether it is required (modules/app-updates).
CREATE TABLE IF NOT EXISTS "AppReleasePolicy" (
    "platform" TEXT NOT NULL,
    "latestVersion" TEXT NOT NULL,
    "latestBuild" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'FLEXIBLE',
    "storeUrl" TEXT,
    "downloadUrl" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppReleasePolicy_pkey" PRIMARY KEY ("platform")
);
