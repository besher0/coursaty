-- Existing subscriptions must never outlive their course.
-- This only caps expirations; it does not extend or recalculate code durations.
UPDATE "StudentSubscription" AS subscription
SET "expiresAt" = course."expiresAt"
FROM "Course" AS course
WHERE subscription."courseId" = course."id"
  AND course."expiresAt" IS NOT NULL
  AND (
    subscription."expiresAt" IS NULL
    OR subscription."expiresAt" > course."expiresAt"
  );
