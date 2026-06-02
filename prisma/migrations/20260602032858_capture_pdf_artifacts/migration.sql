-- AlterTable
ALTER TABLE "captures" ADD COLUMN     "artifact_type" TEXT NOT NULL DEFAULT 'screenshot',
ADD COLUMN     "capture_mode" TEXT NOT NULL DEFAULT 'viewport-screenshot',
ADD COLUMN     "file_name" TEXT,
ADD COLUMN     "mime_type" TEXT,
ADD COLUMN     "original_url" TEXT,
ADD COLUMN     "source" TEXT DEFAULT 'browser-extension',
ADD COLUMN     "storage_path" TEXT,
ADD COLUMN     "title" TEXT;
