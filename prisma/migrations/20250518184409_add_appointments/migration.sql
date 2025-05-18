/*
  Warnings:

  - A unique constraint covering the columns `[appointmentId,userId]` on the table `Session` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `appointmentId` to the `Session` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Session_roomId_userId_key";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "appointmentId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "clientId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_roomId_key" ON "Appointment"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_appointmentId_userId_key" ON "Session"("appointmentId", "userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
