-- Enforce one successful redemption per student and code.
-- Preserve historical redemptions from financial records, including cases
-- where the same code was previously redeemed multiple times.
CREATE TABLE "CodeRedemption" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodeRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CodeRedemption_codeId_studentId_key"
ON "CodeRedemption"("codeId", "studentId");

CREATE INDEX "CodeRedemption_studentId_idx"
ON "CodeRedemption"("studentId");

INSERT INTO "CodeRedemption" ("id", "codeId", "studentId", "createdAt")
SELECT DISTINCT ON (rt."codeId", rt."studentId")
    md5(rt."codeId" || ':' || rt."studentId"),
    rt."codeId",
    rt."studentId",
    rt."purchasedAt"
FROM "RevenueTransaction" rt
WHERE rt."codeId" IS NOT NULL
ORDER BY rt."codeId", rt."studentId", rt."purchasedAt" ASC;
