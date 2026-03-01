-- AlterTable
ALTER TABLE "Subject" ADD COLUMN "yearId" BIGINT;
ALTER TABLE "Subject" ADD COLUMN "seasonId" BIGINT;

-- CreateIndex
CREATE INDEX "Subject_yearId_idx" ON "Subject"("yearId");

-- CreateIndex
CREATE INDEX "Subject_seasonId_idx" ON "Subject"("seasonId");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
