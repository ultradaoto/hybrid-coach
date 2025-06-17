/*
  Warnings:

  - A unique constraint covering the columns `[roomId,userId]` on the table `Session` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Session_roomId_userId_key" ON "Session"("roomId", "userId");
