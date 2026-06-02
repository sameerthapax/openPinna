/*
  Warnings:

  - You are about to drop the column `ai_extracted_claim` on the `notes` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[note_knowledge_id]` on the table `notes` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "notes" DROP COLUMN "ai_extracted_claim",
ADD COLUMN     "note_knowledge_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "notes_note_knowledge_id_key" ON "notes"("note_knowledge_id");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_note_knowledge_id_fkey" FOREIGN KEY ("note_knowledge_id") REFERENCES "note_knowledge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
