-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "voice_audio_id" UUID,
ADD COLUMN     "voice_session_id" UUID;

-- CreateTable
CREATE TABLE "voice_audio_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID,
    "note_id" UUID,
    "pinna_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "source_json" JSONB,
    "selected_text" TEXT,
    "page_url" TEXT,
    "page_title" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_audio_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_audios" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "session_id" UUID NOT NULL,
    "full_audio_path" TEXT,
    "mime_type" TEXT,
    "duration_ms" INTEGER,
    "final_transcript" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_audios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_audio_chunks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "session_id" UUID NOT NULL,
    "audio_id" UUID NOT NULL,
    "chunk_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "transcript" TEXT,
    "transcription_status" TEXT NOT NULL DEFAULT 'pending',
    "transcription_error" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcribed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_audio_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voice_audio_sessions_project_id_idx" ON "voice_audio_sessions"("project_id");

-- CreateIndex
CREATE INDEX "voice_audio_sessions_pinna_id_idx" ON "voice_audio_sessions"("pinna_id");

-- CreateIndex
CREATE INDEX "voice_audio_sessions_note_id_idx" ON "voice_audio_sessions"("note_id");

-- CreateIndex
CREATE UNIQUE INDEX "voice_audios_session_id_key" ON "voice_audios"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "voice_audio_chunks_chunk_id_key" ON "voice_audio_chunks"("chunk_id");

-- CreateIndex
CREATE INDEX "voice_audio_chunks_session_id_chunk_index_idx" ON "voice_audio_chunks"("session_id", "chunk_index");

-- CreateIndex
CREATE INDEX "voice_audio_chunks_audio_id_chunk_index_idx" ON "voice_audio_chunks"("audio_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "voice_audio_chunks_session_id_chunk_index_key" ON "voice_audio_chunks"("session_id", "chunk_index");

-- CreateIndex
CREATE INDEX "notes_voice_session_id_idx" ON "notes"("voice_session_id");

-- CreateIndex
CREATE INDEX "notes_voice_audio_id_idx" ON "notes"("voice_audio_id");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_voice_session_id_fkey" FOREIGN KEY ("voice_session_id") REFERENCES "voice_audio_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_voice_audio_id_fkey" FOREIGN KEY ("voice_audio_id") REFERENCES "voice_audios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_audio_sessions" ADD CONSTRAINT "voice_audio_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_audio_sessions" ADD CONSTRAINT "voice_audio_sessions_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_audios" ADD CONSTRAINT "voice_audios_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "voice_audio_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_audio_chunks" ADD CONSTRAINT "voice_audio_chunks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "voice_audio_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_audio_chunks" ADD CONSTRAINT "voice_audio_chunks_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "voice_audios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
