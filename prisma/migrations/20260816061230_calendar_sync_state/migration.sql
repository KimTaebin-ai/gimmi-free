-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "calendarId" TEXT NOT NULL DEFAULT 'primary',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "htmlLink" TEXT;

-- CreateTable
CREATE TABLE "CalendarSyncState" (
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "syncToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "CalendarSyncState_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "CalendarSyncState" ADD CONSTRAINT "CalendarSyncState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
