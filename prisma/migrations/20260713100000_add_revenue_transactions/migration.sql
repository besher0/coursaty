-- RevenueTransaction is an append-only financial ledger. Its identifiers are
-- deliberately stored as scalar snapshots, without foreign keys, so historical
-- revenue survives deletion or later changes to the source records.
CREATE TYPE "RevenueTransactionType" AS ENUM ('INITIAL', 'RENEWAL', 'BACKFILL');

CREATE TABLE "RevenueTransaction" (
    "id" TEXT NOT NULL,
    "type" "RevenueTransactionType" NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "universityId" TEXT,
    "universityName" TEXT,
    "collegeId" TEXT,
    "collegeName" TEXT,
    "codeId" TEXT,
    "codeGroupId" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL DEFAULT 'SYP',
    "coursePrice" DECIMAL(10,2) NOT NULL,
    "courseDiscountPercentage" DECIMAL(5,2) NOT NULL,
    "courseDiscountAmount" DECIMAL(10,2) NOT NULL,
    "codeDiscountPercentage" DECIMAL(5,2) NOT NULL,
    "codeDiscountAmount" DECIMAL(10,2) NOT NULL,
    "finalPrice" DECIMAL(10,2) NOT NULL,
    "teacherPercentage" DECIMAL(5,2) NOT NULL,
    "teacherRevenue" DECIMAL(10,2) NOT NULL,
    "platformRevenue" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "RevenueTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RevenueTransaction_purchasedAt_idx"
ON "RevenueTransaction"("purchasedAt");

CREATE INDEX "RevenueTransaction_studentId_purchasedAt_idx"
ON "RevenueTransaction"("studentId", "purchasedAt");

CREATE INDEX "RevenueTransaction_courseId_purchasedAt_idx"
ON "RevenueTransaction"("courseId", "purchasedAt");

CREATE INDEX "RevenueTransaction_teacherId_purchasedAt_idx"
ON "RevenueTransaction"("teacherId", "purchasedAt");

CREATE INDEX "RevenueTransaction_universityId_purchasedAt_idx"
ON "RevenueTransaction"("universityId", "purchasedAt");

CREATE INDEX "RevenueTransaction_collegeId_purchasedAt_idx"
ON "RevenueTransaction"("collegeId", "purchasedAt");

-- One recoverable historical entry per currently materialized subscription.
-- Earlier renewals overwritten by StudentSubscription cannot be reconstructed.
INSERT INTO "RevenueTransaction" (
    "id",
    "type",
    "studentId",
    "studentName",
    "courseId",
    "courseName",
    "teacherId",
    "teacherName",
    "universityId",
    "universityName",
    "collegeId",
    "collegeName",
    "purchasedAt",
    "currency",
    "coursePrice",
    "courseDiscountPercentage",
    "courseDiscountAmount",
    "codeDiscountPercentage",
    "codeDiscountAmount",
    "finalPrice",
    "teacherPercentage",
    "teacherRevenue",
    "platformRevenue"
)
SELECT
    subscription."id"::text,
    'BACKFILL'::"RevenueTransactionType",
    subscription."studentId"::text,
    student."name",
    subscription."courseId"::text,
    course."name",
    course."teacherId"::text,
    teacher."name",
    course."universityId"::text,
    university."name",
    course."collegeId"::text,
    college."name",
    subscription."createdAt",
    'SYP',
    subscription."basePrice",
    CASE
      WHEN subscription."basePrice" = 0 THEN 0
      ELSE ROUND(subscription."courseDiscountAmount" * 100 / subscription."basePrice", 2)
    END,
    subscription."courseDiscountAmount",
    CASE
      WHEN subscription."basePrice" - subscription."courseDiscountAmount" = 0 THEN 0
      ELSE ROUND(
        subscription."codeDiscountAmount" * 100
        / (subscription."basePrice" - subscription."courseDiscountAmount"),
        2
      )
    END,
    subscription."codeDiscountAmount",
    subscription."finalPrice",
    ROUND(course."teacherPercentage", 2),
    ROUND(subscription."finalPrice" * course."teacherPercentage" / 100, 2),
    subscription."finalPrice"
      - ROUND(subscription."finalPrice" * course."teacherPercentage" / 100, 2)
FROM "StudentSubscription" AS subscription
JOIN "Student" AS student ON student."id" = subscription."studentId"
JOIN "Course" AS course ON course."id" = subscription."courseId"
JOIN "Teacher" AS teacher ON teacher."id" = course."teacherId"
LEFT JOIN "University" AS university ON university."id" = course."universityId"
LEFT JOIN "College" AS college ON college."id" = course."collegeId";

CREATE FUNCTION prevent_revenue_transaction_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'RevenueTransaction is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "RevenueTransaction_append_only"
BEFORE UPDATE OR DELETE ON "RevenueTransaction"
FOR EACH ROW EXECUTE FUNCTION prevent_revenue_transaction_mutation();
