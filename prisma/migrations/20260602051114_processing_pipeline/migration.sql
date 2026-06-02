-- CreateTable
CREATE TABLE "processing_job_outbox" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "project_id" UUID,
    "session_id" UUID,
    "note_id" UUID,
    "source_id" UUID,
    "voice_session_id" UUID,
    "audio_id" UUID,
    "screenshot_id" UUID,
    "capture_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_job_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_job_history" (
    "id" UUID NOT NULL,
    "job_type" TEXT NOT NULL,
    "final_status" TEXT NOT NULL,
    "project_id" UUID,
    "session_id" UUID,
    "note_id" UUID,
    "source_id" UUID,
    "voice_session_id" UUID,
    "audio_id" UUID,
    "screenshot_id" UUID,
    "capture_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_job_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screenshot_capture_processing" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "screenshot_id" UUID,
    "capture_id" UUID,
    "source_id" UUID,
    "note_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "extracted_text" TEXT,
    "important_text" TEXT,
    "model" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screenshot_capture_processing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_knowledge" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "note_id" UUID NOT NULL,
    "source_id" UUID,
    "project_id" UUID,
    "session_id" UUID,
    "title" TEXT,
    "authors" JSONB DEFAULT '[]',
    "publication_date" TEXT,
    "abstract" TEXT,
    "summary" TEXT,
    "key_findings" TEXT NOT NULL,
    "user_view" TEXT NOT NULL,
    "conclusion" TEXT NOT NULL,
    "model" TEXT,
    "source_snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_job_outbox_status_run_after_created_at_idx" ON "processing_job_outbox"("status", "run_after", "created_at");

-- CreateIndex
CREATE INDEX "processing_job_outbox_note_id_job_type_idx" ON "processing_job_outbox"("note_id", "job_type");

-- CreateIndex
CREATE INDEX "processing_job_outbox_voice_session_id_job_type_idx" ON "processing_job_outbox"("voice_session_id", "job_type");

-- CreateIndex
CREATE INDEX "processing_job_history_note_id_job_type_idx" ON "processing_job_history"("note_id", "job_type");

-- CreateIndex
CREATE INDEX "processing_job_history_voice_session_id_job_type_idx" ON "processing_job_history"("voice_session_id", "job_type");

-- CreateIndex
CREATE INDEX "processing_job_history_final_status_created_at_idx" ON "processing_job_history"("final_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "screenshot_capture_processing_screenshot_id_key" ON "screenshot_capture_processing"("screenshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "screenshot_capture_processing_capture_id_key" ON "screenshot_capture_processing"("capture_id");

-- CreateIndex
CREATE INDEX "screenshot_capture_processing_status_created_at_idx" ON "screenshot_capture_processing"("status", "created_at");

-- CreateIndex
CREATE INDEX "screenshot_capture_processing_note_id_idx" ON "screenshot_capture_processing"("note_id");

-- CreateIndex
CREATE INDEX "screenshot_capture_processing_source_id_idx" ON "screenshot_capture_processing"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "note_knowledge_note_id_key" ON "note_knowledge"("note_id");

-- CreateIndex
CREATE INDEX "note_knowledge_project_id_idx" ON "note_knowledge"("project_id");

-- CreateIndex
CREATE INDEX "note_knowledge_session_id_idx" ON "note_knowledge"("session_id");

-- CreateIndex
CREATE INDEX "note_knowledge_source_id_idx" ON "note_knowledge"("source_id");

-- AddForeignKey
ALTER TABLE "note_knowledge" ADD CONSTRAINT "note_knowledge_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
