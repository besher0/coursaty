-- Telegram video explaining payment and subscription (app payment page); null until set.
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "paymentVideoUrl" TEXT;
