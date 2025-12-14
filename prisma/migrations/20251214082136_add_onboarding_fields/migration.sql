-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "intakeCoachingGoals" TEXT,
ADD COLUMN     "intakeInitialMood" INTEGER,
ADD COLUMN     "intakeSymptoms" TEXT,
ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuthCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "skoolUserId" TEXT NOT NULL,
    "skoolUsername" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedIpAddress" TEXT,
    "userAgent" TEXT,
    "deviceFingerprint" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "skoolUserId" TEXT NOT NULL,
    "skoolUsername" TEXT NOT NULL,
    "authCodeUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "skoolUserId" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "lastRequestAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthCode_code_key" ON "AuthCode"("code");

-- CreateIndex
CREATE INDEX "AuthCode_code_idx" ON "AuthCode"("code");

-- CreateIndex
CREATE INDEX "AuthCode_skoolUserId_generatedAt_idx" ON "AuthCode"("skoolUserId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_sessionId_key" ON "UserSession"("sessionId");

-- CreateIndex
CREATE INDEX "UserSession_sessionId_idx" ON "UserSession"("sessionId");

-- CreateIndex
CREATE INDEX "UserSession_skoolUserId_idx" ON "UserSession"("skoolUserId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimit_skoolUserId_requestDate_idx" ON "RateLimit"("skoolUserId", "requestDate");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_skoolUserId_requestDate_key" ON "RateLimit"("skoolUserId", "requestDate");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_authCodeUsed_fkey" FOREIGN KEY ("authCodeUsed") REFERENCES "AuthCode"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
