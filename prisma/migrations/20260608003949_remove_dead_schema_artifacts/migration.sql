/*
  Warnings:

  - You are about to drop the column `screenshot_chunk_processing_id` on the `processing_job_history` table. All the data in the column will be lost.
  - You are about to drop the column `screenshot_processing_id` on the `processing_job_history` table. All the data in the column will be lost.
  - You are about to drop the column `screenshot_chunk_processing_id` on the `processing_job_outbox` table. All the data in the column will be lost.
  - You are about to drop the column `screenshot_processing_id` on the `processing_job_outbox` table. All the data in the column will be lost.
  - You are about to drop the `agent_tool_permissions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `screenshot_capture_processing` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `screenshot_chunk_processing` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `thread_base_knowledge` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `thread_knowledge_heads` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tools` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "agent_tool_permissions" DROP CONSTRAINT "agent_tool_permissions_tool_id_fkey";

-- DropForeignKey
ALTER TABLE "screenshot_capture_processing" DROP CONSTRAINT "screenshot_capture_processing_capture_id_fkey";

-- DropForeignKey
ALTER TABLE "screenshot_capture_processing" DROP CONSTRAINT "screenshot_capture_processing_note_id_fkey";

-- DropForeignKey
ALTER TABLE "screenshot_capture_processing" DROP CONSTRAINT "screenshot_capture_processing_screenshot_id_fkey";

-- DropForeignKey
ALTER TABLE "screenshot_chunk_processing" DROP CONSTRAINT "screenshot_chunk_processing_screenshot_processing_id_fkey";

-- DropForeignKey
ALTER TABLE "screenshot_chunk_processing" DROP CONSTRAINT "screenshot_chunk_processing_voice_screenshot_chunk_id_fkey";

-- DropForeignKey
ALTER TABLE "thread_base_knowledge" DROP CONSTRAINT "thread_base_knowledge_thread_id_fkey";

-- DropForeignKey
ALTER TABLE "thread_knowledge_heads" DROP CONSTRAINT "thread_knowledge_heads_current_build_id_fkey";

-- DropForeignKey
ALTER TABLE "thread_knowledge_heads" DROP CONSTRAINT "thread_knowledge_heads_thread_id_fkey";

-- DropIndex
DROP INDEX "processing_job_history_screenshot_chunk_processing_id_job_t_idx";

-- DropIndex
DROP INDEX "processing_job_history_screenshot_processing_id_job_type_idx";

-- DropIndex
DROP INDEX "processing_job_outbox_screenshot_chunk_processing_id_job_ty_idx";

-- DropIndex
DROP INDEX "processing_job_outbox_screenshot_processing_id_job_type_idx";

-- AlterTable
ALTER TABLE "processing_job_history" DROP COLUMN "screenshot_chunk_processing_id",
DROP COLUMN "screenshot_processing_id";

-- AlterTable
ALTER TABLE "processing_job_outbox" DROP COLUMN "screenshot_chunk_processing_id",
DROP COLUMN "screenshot_processing_id";

-- DropTable
DROP TABLE "agent_tool_permissions";

-- DropTable
DROP TABLE "screenshot_capture_processing";

-- DropTable
DROP TABLE "screenshot_chunk_processing";

-- DropTable
DROP TABLE "thread_base_knowledge";

-- DropTable
DROP TABLE "thread_knowledge_heads";

-- DropTable
DROP TABLE "tools";
