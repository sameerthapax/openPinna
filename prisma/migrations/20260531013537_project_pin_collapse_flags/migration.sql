-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "is_collapsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_pinned" BOOLEAN NOT NULL DEFAULT false;
