-- AlterTable
ALTER TABLE "Session" ADD COLUMN "sessionType" TEXT NOT NULL DEFAULT 'adhoc';

-- CreateIndex
CREATE INDEX "Session_sessionType_idx" ON "Session"("sessionType");
