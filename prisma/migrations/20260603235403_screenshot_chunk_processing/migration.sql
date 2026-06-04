-- AlterTable
ALTER TABLE "processing_job_history" ADD COLUMN     "screenshot_chunk_processing_id" UUID,
ADD COLUMN     "screenshot_processing_id" UUID;

-- AlterTable
ALTER TABLE "processing_job_outbox" ADD COLUMN     "screenshot_chunk_processing_id" UUID,
ADD COLUMN     "screenshot_processing_id" UUID;

-- AlterTable
ALTER TABLE "screenshot_capture_processing" ADD COLUMN     "aggregated_at" TIMESTAMPTZ(6),
ADD COLUMN     "completed_chunk_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "expected_chunk_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failed_chunk_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "screenshot_chunk_processing" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "screenshot_processing_id" UUID NOT NULL,
    "voice_screenshot_chunk_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extracted_text" TEXT,
    "important_text" TEXT,
    "model" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screenshot_chunk_processing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "screenshot_chunk_processing_voice_screenshot_chunk_id_key" ON "screenshot_chunk_processing"("voice_screenshot_chunk_id");

-- CreateIndex
CREATE INDEX "screenshot_chunk_processing_status_created_at_idx" ON "screenshot_chunk_processing"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "screenshot_chunk_processing_screenshot_processing_id_chunk__key" ON "screenshot_chunk_processing"("screenshot_processing_id", "chunk_index");

-- CreateIndex
CREATE INDEX "processing_job_history_screenshot_processing_id_job_type_idx" ON "processing_job_history"("screenshot_processing_id", "job_type");

-- CreateIndex
CREATE INDEX "processing_job_history_screenshot_chunk_processing_id_job_t_idx" ON "processing_job_history"("screenshot_chunk_processing_id", "job_type");

-- CreateIndex
CREATE INDEX "processing_job_outbox_screenshot_processing_id_job_type_idx" ON "processing_job_outbox"("screenshot_processing_id", "job_type");

-- CreateIndex
CREATE INDEX "processing_job_outbox_screenshot_chunk_processing_id_job_ty_idx" ON "processing_job_outbox"("screenshot_chunk_processing_id", "job_type");

-- AddForeignKey
ALTER TABLE "screenshot_capture_processing" ADD CONSTRAINT "screenshot_capture_processing_screenshot_id_fkey" FOREIGN KEY ("screenshot_id") REFERENCES "voice_screenshot_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshot_capture_processing" ADD CONSTRAINT "screenshot_capture_processing_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshot_capture_processing" ADD CONSTRAINT "screenshot_capture_processing_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshot_chunk_processing" ADD CONSTRAINT "screenshot_chunk_processing_screenshot_processing_id_fkey" FOREIGN KEY ("screenshot_processing_id") REFERENCES "screenshot_capture_processing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshot_chunk_processing" ADD CONSTRAINT "screenshot_chunk_processing_voice_screenshot_chunk_id_fkey" FOREIGN KEY ("voice_screenshot_chunk_id") REFERENCES "voice_screenshot_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
