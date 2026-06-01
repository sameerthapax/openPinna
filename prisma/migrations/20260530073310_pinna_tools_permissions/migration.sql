/*
  Warnings:

  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ResearchMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ResearchSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ResearchThread` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SessionNote` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ResearchMessage" DROP CONSTRAINT "ResearchMessage_threadId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchSession" DROP CONSTRAINT "ResearchSession_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchThread" DROP CONSTRAINT "ResearchThread_noteId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchThread" DROP CONSTRAINT "ResearchThread_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ResearchThread" DROP CONSTRAINT "ResearchThread_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "SessionNote" DROP CONSTRAINT "SessionNote_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "captures" DROP CONSTRAINT "captures_session_id_fkey";

-- DropForeignKey
ALTER TABLE "captures" DROP CONSTRAINT "captures_source_id_fkey";

-- DropForeignKey
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_thread_id_fkey";

-- DropForeignKey
ALTER TABLE "chat_threads" DROP CONSTRAINT "chat_threads_note_id_fkey";

-- DropForeignKey
ALTER TABLE "chat_threads" DROP CONSTRAINT "chat_threads_project_id_fkey";

-- DropForeignKey
ALTER TABLE "chat_threads" DROP CONSTRAINT "chat_threads_session_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_edges" DROP CONSTRAINT "knowledge_edges_from_node_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_edges" DROP CONSTRAINT "knowledge_edges_to_node_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_events" DROP CONSTRAINT "knowledge_events_note_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_events" DROP CONSTRAINT "knowledge_events_project_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_events" DROP CONSTRAINT "knowledge_events_session_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_events" DROP CONSTRAINT "knowledge_events_thread_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_nodes" DROP CONSTRAINT "knowledge_nodes_note_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_nodes" DROP CONSTRAINT "knowledge_nodes_project_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_nodes" DROP CONSTRAINT "knowledge_nodes_session_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_nodes" DROP CONSTRAINT "knowledge_nodes_source_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_nodes" DROP CONSTRAINT "knowledge_nodes_thread_id_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_capture_id_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_project_id_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_session_id_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_source_id_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_project_id_fkey";

-- DropForeignKey
ALTER TABLE "sources" DROP CONSTRAINT "sources_project_id_fkey";

-- DropForeignKey
ALTER TABLE "sources" DROP CONSTRAINT "sources_session_id_fkey";

-- DropIndex
DROP INDEX "idx_notes_embedding_ivfflat";

-- DropIndex
DROP INDEX "idx_projects_embedding_ivfflat";

-- DropIndex
DROP INDEX "idx_sessions_embedding_ivfflat";

-- AlterTable
ALTER TABLE "chat_threads" ADD COLUMN     "custom_instructions" TEXT,
ADD COLUMN     "pinna_template_id" UUID;

-- DropTable
DROP TABLE "Project";

-- DropTable
DROP TABLE "ResearchMessage";

-- DropTable
DROP TABLE "ResearchSession";

-- DropTable
DROP TABLE "ResearchThread";

-- DropTable
DROP TABLE "SessionNote";

-- DropEnum
DROP TYPE "ResearchMessageRole";

-- DropEnum
DROP TYPE "ResearchScopeType";

-- DropEnum
DROP TYPE "ResearchTopicType";

-- CreateTable
CREATE TABLE "pinna_templates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_title" TEXT,
    "system_prompt" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinna_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tools" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "handler_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tool_permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "agent_type" TEXT NOT NULL,
    "agent_key" TEXT NOT NULL,
    "tool_id" UUID NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_tool_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_calls" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "thread_id" UUID NOT NULL,
    "message_id" UUID,
    "tool_key" TEXT NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pinna_templates_key_key" ON "pinna_templates"("key");

-- CreateIndex
CREATE INDEX "pinna_templates_key_idx" ON "pinna_templates"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tools_key_key" ON "tools"("key");

-- CreateIndex
CREATE INDEX "tools_key_idx" ON "tools"("key");

-- CreateIndex
CREATE INDEX "tools_scope_idx" ON "tools"("scope");

-- CreateIndex
CREATE INDEX "agent_tool_permissions_agent_type_agent_key_idx" ON "agent_tool_permissions"("agent_type", "agent_key");

-- CreateIndex
CREATE UNIQUE INDEX "agent_tool_permissions_agent_type_agent_key_tool_id_key" ON "agent_tool_permissions"("agent_type", "agent_key", "tool_id");

-- CreateIndex
CREATE INDEX "tool_calls_thread_id_idx" ON "tool_calls"("thread_id");

-- CreateIndex
CREATE INDEX "tool_calls_tool_key_idx" ON "tool_calls"("tool_key");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_pinna_template_id_fkey" FOREIGN KEY ("pinna_template_id") REFERENCES "pinna_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tool_permissions" ADD CONSTRAINT "agent_tool_permissions_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_events" ADD CONSTRAINT "knowledge_events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_nodes" ADD CONSTRAINT "knowledge_nodes_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_from_node_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_to_node_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "knowledge_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_chat_messages_thread_created" RENAME TO "chat_messages_thread_id_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_chat_threads_note_id" RENAME TO "chat_threads_note_id_idx";

-- RenameIndex
ALTER INDEX "idx_chat_threads_session_id" RENAME TO "chat_threads_session_id_idx";

-- RenameIndex
ALTER INDEX "idx_knowledge_edges_from_node_id" RENAME TO "knowledge_edges_from_node_id_idx";

-- RenameIndex
ALTER INDEX "idx_knowledge_edges_to_node_id" RENAME TO "knowledge_edges_to_node_id_idx";

-- RenameIndex
ALTER INDEX "idx_knowledge_events_project_status" RENAME TO "knowledge_events_project_id_status_idx";

-- RenameIndex
ALTER INDEX "idx_knowledge_events_session_status" RENAME TO "knowledge_events_session_id_status_idx";

-- RenameIndex
ALTER INDEX "idx_knowledge_nodes_project_id" RENAME TO "knowledge_nodes_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_notes_project_id" RENAME TO "notes_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_notes_session_id" RENAME TO "notes_session_id_idx";

-- RenameIndex
ALTER INDEX "idx_notes_source_id" RENAME TO "notes_source_id_idx";

-- RenameIndex
ALTER INDEX "idx_sessions_project_session_key" RENAME TO "sessions_project_id_session_key_idx";

-- RenameIndex
ALTER INDEX "idx_sources_project_id" RENAME TO "sources_project_id_idx";

-- RenameIndex
ALTER INDEX "idx_sources_session_id" RENAME TO "sources_session_id_idx";
