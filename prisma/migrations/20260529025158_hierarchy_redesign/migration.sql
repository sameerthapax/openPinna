/*
  Warnings:

  - You are about to drop the `ResearchNote` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ResearchScopeType" AS ENUM ('PROJECT', 'SESSION', 'NOTE');

-- CreateEnum
CREATE TYPE "ResearchTopicType" AS ENUM ('GENERAL', 'QUESTION', 'STATEMENT', 'FIT', 'WEAKNESS', 'STRENGTH', 'CONTRADICTION', 'METHODOLOGY', 'FINDING', 'CONCLUSION', 'EXPERIMENT', 'SENTIMENT');

-- CreateEnum
CREATE TYPE "ResearchMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- DropTable
DROP TABLE "ResearchNote";

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "selectedText" TEXT,
    "body" TEXT NOT NULL,
    "tags" TEXT[],
    "boardX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "boardY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchThread" (
    "id" TEXT NOT NULL,
    "scopeType" "ResearchScopeType" NOT NULL,
    "topicType" "ResearchTopicType" NOT NULL,
    "title" TEXT NOT NULL,
    "projectId" TEXT,
    "sessionId" TEXT,
    "noteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "ResearchMessageRole" NOT NULL DEFAULT 'USER',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE INDEX "ResearchSession_projectId_idx" ON "ResearchSession"("projectId");

-- CreateIndex
CREATE INDEX "ResearchSession_sessionDate_idx" ON "ResearchSession"("sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSession_projectId_sessionDate_key" ON "ResearchSession"("projectId", "sessionDate");

-- CreateIndex
CREATE INDEX "SessionNote_sessionId_idx" ON "SessionNote"("sessionId");

-- CreateIndex
CREATE INDEX "SessionNote_capturedAt_idx" ON "SessionNote"("capturedAt");

-- CreateIndex
CREATE INDEX "ResearchThread_scopeType_idx" ON "ResearchThread"("scopeType");

-- CreateIndex
CREATE INDEX "ResearchThread_projectId_idx" ON "ResearchThread"("projectId");

-- CreateIndex
CREATE INDEX "ResearchThread_sessionId_idx" ON "ResearchThread"("sessionId");

-- CreateIndex
CREATE INDEX "ResearchThread_noteId_idx" ON "ResearchThread"("noteId");

-- CreateIndex
CREATE INDEX "ResearchMessage_threadId_createdAt_idx" ON "ResearchMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchThread" ADD CONSTRAINT "ResearchThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchThread" ADD CONSTRAINT "ResearchThread_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchThread" ADD CONSTRAINT "ResearchThread_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "SessionNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchMessage" ADD CONSTRAINT "ResearchMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ResearchThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
