ALTER TABLE "Course"
  ALTER COLUMN "courseDiscountPercentage" TYPE DECIMAL(9,6);

ALTER TABLE "SubscriptionRequest"
  ALTER COLUMN "courseDiscountPercentage" TYPE DECIMAL(9,6);

ALTER TABLE "RevenueTransaction"
  ALTER COLUMN "courseDiscountPercentage" TYPE DECIMAL(9,6);
