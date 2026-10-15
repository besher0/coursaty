-- New codes default to a single redemption when usageLimit is omitted.
-- Existing NULL limits are interpreted as one by the service without rewriting history.
ALTER TABLE "Code" ALTER COLUMN "usageLimit" SET DEFAULT 1;
