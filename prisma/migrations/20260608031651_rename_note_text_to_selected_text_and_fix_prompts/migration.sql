/*
  Warnings:

  - You are about to drop the column `note_text` on the `notes` table. All the data in the column will be lost.
  - Added the required column `selectedText` to the `notes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "notes" DROP COLUMN "note_text",
ADD COLUMN     "selectedText" TEXT NOT NULL;
