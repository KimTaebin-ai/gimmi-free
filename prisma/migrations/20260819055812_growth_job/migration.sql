-- CreateEnum
CREATE TYPE "GrowthJobStatus" AS ENUM ('running', 'done', 'failed');

-- CreateTable
CREATE TABLE "GrowthJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GrowthJobStatus" NOT NULL DEFAULT 'running',
    "error" TEXT,
    "summaryId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GrowthJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowthJob_userId_startedAt_idx" ON "GrowthJob"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "GrowthJob" ADD CONSTRAINT "GrowthJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
