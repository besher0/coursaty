CREATE TYPE "SubscriptionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "SubscriptionRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "receiptUrl" TEXT NOT NULL,
    "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionRequest_studentId_idx" ON "SubscriptionRequest"("studentId");
CREATE INDEX "SubscriptionRequest_courseId_idx" ON "SubscriptionRequest"("courseId");
CREATE INDEX "SubscriptionRequest_status_idx" ON "SubscriptionRequest"("status");
CREATE INDEX "SubscriptionRequest_createdAt_idx" ON "SubscriptionRequest"("createdAt");

ALTER TABLE "SubscriptionRequest"
ADD CONSTRAINT "SubscriptionRequest_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequest"
ADD CONSTRAINT "SubscriptionRequest_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscriptionRequest"
ADD CONSTRAINT "SubscriptionRequest_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "Admin"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
