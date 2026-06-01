/*
  Warnings:

  - A unique constraint covering the columns `[thread_id,seq]` on the table `knowledge_events` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[build_id,stable_key]` on the table `knowledge_nodes` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "knowledge_edges" ADD COLUMN     "build_id" UUID,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "thread_id" UUID;

-- AlterTable
ALTER TABLE "knowledge_events" ADD COLUMN     "actor" TEXT,
ADD COLUMN     "message_ref" TEXT,
ADD COLUMN     "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "seq" BIGINT,
ADD COLUMN     "supersedes_event_id" UUID;

-- AlterTable
ALTER TABLE "knowledge_nodes" ADD COLUMN     "body" TEXT,
ADD COLUMN     "build_id" UUID,
ADD COLUMN     "confidence" DECIMAL(5,4),
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "stable_key" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateTable
CREATE TABLE "thread_base_knowledge" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "thread_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_base_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_builds" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "thread_id" UUID NOT NULL,
    "build_version" INTEGER NOT NULL,
    "parent_build_id" UUID,
    "event_seq_from" BIGINT NOT NULL,
    "event_seq_to" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'complete',
    "generator" TEXT NOT NULL,
    "event_from_id" UUID,
    "event_to_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_builds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_summaries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "thread_id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "summary_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'markdown',
    "generator" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thread_knowledge_heads" (
    "thread_id" UUID NOT NULL,
    "current_build_id" UUID,
    "current_event_seq" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thread_knowledge_heads_pkey" PRIMARY KEY ("thread_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "thread_base_knowledge_thread_id_version_key" ON "thread_base_knowledge"("thread_id", "version");

-- CreateIndex
CREATE INDEX "knowledge_builds_thread_id_created_at_idx" ON "knowledge_builds"("thread_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_builds_thread_id_build_version_key" ON "knowledge_builds"("thread_id", "build_version");

-- CreateIndex
CREATE INDEX "knowledge_summaries_thread_id_created_at_idx" ON "knowledge_summaries"("thread_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_summaries_build_id_summary_type_key" ON "knowledge_summaries"("build_id", "summary_type");

-- CreateIndex
CREATE INDEX "knowledge_edges_build_id_edge_type_idx" ON "knowledge_edges"("build_id", "edge_type");

-- CreateIndex
CREATE INDEX "knowledge_events_thread_id_seq_idx" ON "knowledge_events"("thread_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_events_thread_id_seq_key" ON "knowledge_events"("thread_id", "seq");

-- CreateIndex
CREATE INDEX "knowledge_nodes_thread_id_build_id_idx" ON "knowledge_nodes"("thread_id", "build_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_nodes_build_id_stable_key_key" ON "knowledge_nodes"("build_id", "stable_key");

-- AddForeignKey
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_supersedes_event_id_fkey" FOREIGN KEY ("supersedes_event_id") REFERENCES "knowledge_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "knowledge_builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "knowledge_builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_base_knowledge" ADD CONSTRAINT "thread_base_knowledge_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_builds" ADD CONSTRAINT "knowledge_builds_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_builds" ADD CONSTRAINT "knowledge_builds_parent_build_id_fkey" FOREIGN KEY ("parent_build_id") REFERENCES "knowledge_builds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_builds" ADD CONSTRAINT "knowledge_builds_event_from_id_fkey" FOREIGN KEY ("event_from_id") REFERENCES "knowledge_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_builds" ADD CONSTRAINT "knowledge_builds_event_to_id_fkey" FOREIGN KEY ("event_to_id") REFERENCES "knowledge_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_summaries" ADD CONSTRAINT "knowledge_summaries_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_summaries" ADD CONSTRAINT "knowledge_summaries_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "knowledge_builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_knowledge_heads" ADD CONSTRAINT "thread_knowledge_heads_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "thread_knowledge_heads" ADD CONSTRAINT "thread_knowledge_heads_current_build_id_fkey" FOREIGN KEY ("current_build_id") REFERENCES "knowledge_builds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
