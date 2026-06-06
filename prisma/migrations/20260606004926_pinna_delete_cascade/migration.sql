-- DropForeignKey
ALTER TABLE "chat_threads" DROP CONSTRAINT "chat_threads_pinna_id_fkey";

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_pinna_id_fkey" FOREIGN KEY ("pinna_id") REFERENCES "pinnas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
