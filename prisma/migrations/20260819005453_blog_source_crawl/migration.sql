-- AlterEnum
ALTER TYPE "BlogSource" ADD VALUE 'crawl';

-- AlterTable
ALTER TABLE "BlogPost" ALTER COLUMN "source" SET DEFAULT 'crawl';
