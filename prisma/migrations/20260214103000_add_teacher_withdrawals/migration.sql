-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TeacherWithdrawal" (
    "id" BIGSERIAL NOT NULL,
    "teacherId" BIGINT NOT NULL,
    "amount" DECIMAL(10, 2) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherWithdrawal_teacherId_idx" ON "TeacherWithdrawal"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherWithdrawal_createdAt_idx" ON "TeacherWithdrawal"("createdAt");

-- AddForeignKey
ALTER TABLE "TeacherWithdrawal" ADD CONSTRAINT "TeacherWithdrawal_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
