-- Safe non-destructive change: add optional helper link for advertisements.
ALTER TABLE "Advertisement"
ADD COLUMN IF NOT EXISTS "helperLink" TEXT;
