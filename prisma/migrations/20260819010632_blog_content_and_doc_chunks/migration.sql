-- pgvector. DocChunk.embedding이 vector(1024) 타입이라 테이블보다 먼저 와야 한다.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "DocSource" AS ENUM ('blog');

-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "bodyFetchedAt" TIMESTAMP(3),
ADD COLUMN     "content" TEXT,
ADD COLUMN     "contentBlocks" JSONB;

-- CreateTable
CREATE TABLE "DocChunk" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "DocSource" NOT NULL DEFAULT 'blog',
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "embedding" vector(1024),
    "embedModel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocChunk_userId_occurredAt_idx" ON "DocChunk"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocChunk_userId_source_sourceId_chunkIndex_key" ON "DocChunk"("userId", "source", "sourceId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "DocChunk" ADD CONSTRAINT "DocChunk_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocChunk" ADD CONSTRAINT "DocChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 코사인 거리 기준 근사 최근접 탐색용. 지금 코퍼스는 작아 없어도 되지만,
-- 글이 쌓여도 검색이 선형으로 느려지지 않게 미리 깔아 둔다.
CREATE INDEX "DocChunk_embedding_hnsw_idx" ON "DocChunk" USING hnsw ("embedding" vector_cosine_ops);
