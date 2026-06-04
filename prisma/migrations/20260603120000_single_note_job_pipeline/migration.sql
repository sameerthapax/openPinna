-- AlterTable
ALTER TABLE "voice_screenshot_sessions" ADD COLUMN     "finalization_error" TEXT,
ADD COLUMN     "finalization_model" TEXT,
ADD COLUMN     "finalization_started_at" TIMESTAMPTZ(6),
ADD COLUMN     "finalization_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "finalized_at" TIMESTAMPTZ(6),
ADD COLUMN     "finalized_summary" TEXT,
ADD COLUMN     "important_context" TEXT;

-- AlterTable
ALTER TABLE "voice_screenshot_chunks" ADD COLUMN     "extracted_text" TEXT,
ADD COLUMN     "ocr_completed_at" TIMESTAMPTZ(6),
ADD COLUMN     "ocr_error" TEXT,
ADD COLUMN     "ocr_model" TEXT,
ADD COLUMN     "ocr_started_at" TIMESTAMPTZ(6),
ADD COLUMN     "ocr_status" TEXT NOT NULL DEFAULT 'pending';
