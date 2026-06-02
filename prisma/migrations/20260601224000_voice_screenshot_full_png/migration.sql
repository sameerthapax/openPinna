-- AlterTable
ALTER TABLE "voice_screenshot_sessions" ADD COLUMN     "capture_id" UUID,
ADD COLUMN     "full_image_path" TEXT,
ADD COLUMN     "source_id" UUID;

-- CreateIndex
CREATE INDEX "voice_screenshot_sessions_source_id_idx" ON "voice_screenshot_sessions"("source_id");

-- CreateIndex
CREATE INDEX "voice_screenshot_sessions_capture_id_idx" ON "voice_screenshot_sessions"("capture_id");

