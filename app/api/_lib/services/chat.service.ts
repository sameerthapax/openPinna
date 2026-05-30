import { db } from "@/lib/db";
import { threadMemoryQueue } from "@/app/api/_lib/queues";
import { generateAssistantReply } from "@/app/api/_lib/ai";

export async function createThread(input: {
  projectId: string;
  sessionId: string;
  noteId: string;
  threadType: string;
  title?: string | null;
}) {
  return db.chatThread.create({
    data: {
      projectId: input.projectId,
      sessionId: input.sessionId,
      noteId: input.noteId,
      threadType: input.threadType,
      title: input.title || null,
    },
  });
}

export async function listThreadsByNote(noteId: string) {
  return db.chatThread.findMany({ where: { noteId }, orderBy: { createdAt: "asc" } });
}

export async function getThread(threadId: string) {
  return db.chatThread.findUnique({ where: { id: threadId }, include: { messages: true } });
}

export async function sendMessage(threadId: string, userMessage: string) {
  const thread = await db.chatThread.findUnique({
    where: { id: threadId },
    include: {
      note: { include: { source: true, capture: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });

  if (!thread) throw new Error("Thread not found.");

  await db.chatMessage.create({
    data: { threadId, role: "user", content: userMessage },
  });

  const assistant = await generateAssistantReply({
    noteText: thread.note.noteText,
    sourceTitle: thread.note.source?.title,
    captureText: thread.note.capture?.selectedText,
    threadSummary: thread.summary,
    recentMessages: thread.messages.reverse().map((m) => ({ role: m.role, content: m.content })),
    userMessage,
  });

  const savedAssistant = await db.chatMessage.create({
    data: { threadId, role: "assistant", content: assistant },
  });

  await threadMemoryQueue.add("thread-memory-refresh", { threadId: thread.id });

  return savedAssistant;
}
