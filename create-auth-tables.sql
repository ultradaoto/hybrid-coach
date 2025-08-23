-- Manual SQL to create authentication tables on production database
-- Run this if Prisma migration doesn't work

-- AuthCode table
CREATE TABLE IF NOT EXISTS "AuthCode" (
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

-- UserSession table
CREATE TABLE IF NOT EXISTS "UserSession" (
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

-- RateLimit table
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "id" TEXT NOT NULL,
    "skoolUserId" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "lastRequestAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "AuthCode_code_key" ON "AuthCode"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_sessionId_key" ON "UserSession"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "RateLimit_skoolUserId_requestDate_key" ON "RateLimit"("skoolUserId", "requestDate");

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "AuthCode_code_idx" ON "AuthCode"("code");
CREATE INDEX IF NOT EXISTS "AuthCode_skoolUserId_generatedAt_idx" ON "AuthCode"("skoolUserId", "generatedAt");
CREATE INDEX IF NOT EXISTS "UserSession_sessionId_idx" ON "UserSession"("sessionId");
CREATE INDEX IF NOT EXISTS "UserSession_skoolUserId_idx" ON "UserSession"("skoolUserId");
CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
CREATE INDEX IF NOT EXISTS "RateLimit_skoolUserId_requestDate_idx" ON "RateLimit"("skoolUserId", "requestDate");

-- Create foreign key constraint
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_authCodeUsed_fkey" FOREIGN KEY ("authCodeUsed") REFERENCES "AuthCode"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
