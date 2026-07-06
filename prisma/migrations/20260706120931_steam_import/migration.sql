-- CreateEnum
CREATE TYPE "ImportProvider" AS ENUM ('STEAM');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "steamAppId" INTEGER;

-- AlterTable
ALTER TABLE "LibraryEntry" ADD COLUMN "steamPlaytimeMinutes" INTEGER;

-- CreateTable
CREATE TABLE "ImportSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ImportProvider" NOT NULL,
    "apiKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "lastImportAt" TIMESTAMP(3),

    CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_steamAppId_key" ON "Game"("steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportSource_userId_provider_key" ON "ImportSource"("userId", "provider");

-- AddForeignKey
ALTER TABLE "ImportSource" ADD CONSTRAINT "ImportSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
