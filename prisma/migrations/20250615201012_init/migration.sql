-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSkoolSync" TIMESTAMP(3),
ADD COLUMN     "membershipEndDate" TIMESTAMP(3),
ADD COLUMN     "membershipWarningShown" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "skoolUltraEmail" TEXT,
ADD COLUMN     "skoolVagusEmail" TEXT,
ADD COLUMN     "ultraSubscriptionStatus" TEXT,
ADD COLUMN     "vagusSubscriptionStatus" TEXT;

-- CreateTable
CREATE TABLE "SkoolMonitoringLog" (
    "id" SERIAL NOT NULL,
    "community" TEXT NOT NULL,
    "membersFound" INTEGER NOT NULL,
    "newMembers" INTEGER NOT NULL,
    "cancelledMembers" INTEGER NOT NULL,
    "syncDurationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkoolMonitoringLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipStatusHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "community" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "changeDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipStatusHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MembershipStatusHistory" ADD CONSTRAINT "MembershipStatusHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
