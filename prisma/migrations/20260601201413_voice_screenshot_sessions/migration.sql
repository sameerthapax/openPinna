-- CreateTable
CREATE TABLE "voice_screenshot_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "voice_session_id" UUID NOT NULL,
    "audio_id" UUID,
    "project_id" UUID,
    "pinna_id" TEXT,
    "page_url" TEXT,
    "page_title" TEXT,
    "source_json" JSONB,
    "selected_text" TEXT,
    "document_height" INTEGER,
    "viewport_width" INTEGER,
    "viewport_height" INTEGER,
    "device_pixel_ratio" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'created',
    "manifest_path" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_screenshot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_screenshot_chunks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "screenshot_session_id" UUID NOT NULL,
    "voice_session_id" UUID NOT NULL,
    "audio_id" UUID,
    "chunk_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "page_url" TEXT,
    "page_title" TEXT,
    "scroll_y" INTEGER,
    "viewport_width" INTEGER,
    "viewport_height" INTEGER,
    "document_height" INTEGER,
    "device_pixel_ratio" DOUBLE PRECISION,
    "captured_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'stored',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_screenshot_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voice_screenshot_sessions_voice_session_id_key" ON "voice_screenshot_sessions"("voice_session_id");

-- CreateIndex
CREATE INDEX "voice_screenshot_sessions_audio_id_idx" ON "voice_screenshot_sessions"("audio_id");

-- CreateIndex
CREATE INDEX "voice_screenshot_sessions_project_id_idx" ON "voice_screenshot_sessions"("project_id");

-- CreateIndex
CREATE INDEX "voice_screenshot_sessions_pinna_id_idx" ON "voice_screenshot_sessions"("pinna_id");

-- CreateIndex
CREATE UNIQUE INDEX "voice_screenshot_chunks_chunk_id_key" ON "voice_screenshot_chunks"("chunk_id");

-- CreateIndex
CREATE INDEX "voice_screenshot_chunks_voice_session_id_chunk_index_idx" ON "voice_screenshot_chunks"("voice_session_id", "chunk_index");

-- CreateIndex
CREATE INDEX "voice_screenshot_chunks_audio_id_chunk_index_idx" ON "voice_screenshot_chunks"("audio_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "voice_screenshot_chunks_screenshot_session_id_chunk_index_key" ON "voice_screenshot_chunks"("screenshot_session_id", "chunk_index");

-- AddForeignKey
ALTER TABLE "voice_screenshot_sessions" ADD CONSTRAINT "voice_screenshot_sessions_voice_session_id_fkey" FOREIGN KEY ("voice_session_id") REFERENCES "voice_audio_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_screenshot_sessions" ADD CONSTRAINT "voice_screenshot_sessions_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "voice_audios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_screenshot_sessions" ADD CONSTRAINT "voice_screenshot_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_screenshot_chunks" ADD CONSTRAINT "voice_screenshot_chunks_screenshot_session_id_fkey" FOREIGN KEY ("screenshot_session_id") REFERENCES "voice_screenshot_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_screenshot_chunks" ADD CONSTRAINT "voice_screenshot_chunks_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "voice_audios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

