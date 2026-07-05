-- CreateTable
CREATE TABLE "DiscoveryExclusion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoveryExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryExclusion_userId_igdbId_key" ON "DiscoveryExclusion"("userId", "igdbId");
