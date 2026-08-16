-- AlterTable
ALTER TABLE "TaskEntry" ADD COLUMN     "googleEventId" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "taskId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "TaskEntry_userId_googleEventId_createdAt_idx" ON "TaskEntry"("userId", "googleEventId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskEntry" ADD CONSTRAINT "TaskEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
