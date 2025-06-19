-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "challenges" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "clientFacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "contextNotes" TEXT,
ADD COLUMN     "lastSummary" TEXT,
ADD COLUMN     "preferences" JSONB;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "transcript" TEXT,
ADD COLUMN     "warningsSent" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SessionRating" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "tipAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionRating_sessionId_key" ON "SessionRating"("sessionId");

-- AddForeignKey
ALTER TABLE "SessionRating" ADD CONSTRAINT "SessionRating_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
