import { PrismaClient } from "@prisma/client";
import { syncSkillsFromFilesystemToDb } from "../src/agents/skills/skill-db-sync";

const prisma = new PrismaClient();

async function main() {
  await syncSkillsFromFilesystemToDb(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
