-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastPhotoSync" TIMESTAMP(3),
ADD COLUMN     "profilePhotoPath" TEXT,
ADD COLUMN     "skoolBio" TEXT,
ADD COLUMN     "skoolJoinedDate" TIMESTAMP(3),
ADD COLUMN     "skoolProfilePhotoUrl" TEXT,
ADD COLUMN     "skoolProfileUrl" TEXT;
