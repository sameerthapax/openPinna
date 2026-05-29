-- CreateTable
CREATE TABLE "ResearchNote" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "selectedText" TEXT,
    "rawThought" TEXT NOT NULL,
    "structuredSummary" TEXT,
    "usefulness" TEXT,
    "purpose" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearchNote_createdAt_idx" ON "ResearchNote"("createdAt");
