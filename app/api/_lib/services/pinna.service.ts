import { db } from "@/lib/db";

export async function listPinnaTemplates() {
  return db.pinnaTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getPinnaTemplateByKey(key: string) {
  return db.pinnaTemplate.findFirst({
    where: { key, isActive: true },
  });
}

export async function getPinnaTemplateById(id: string) {
  return db.pinnaTemplate.findFirst({
    where: { id, isActive: true },
  });
}
