-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('note', 'script', 'reflection', 'link');

-- CreateTable
CREATE TABLE "TaskEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "EntryKind" NOT NULL DEFAULT 'note',
    "title" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthSummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "content" JSONB NOT NULL,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskEntry_taskId_createdAt_idx" ON "TaskEntry"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "GrowthSummary_userId_createdAt_idx" ON "GrowthSummary"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskEntry" ADD CONSTRAINT "TaskEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthSummary" ADD CONSTRAINT "GrowthSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
