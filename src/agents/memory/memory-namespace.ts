export function buildPinnaMemoryContext(input: {
  namespace: string;
  pinnaId: string;
  threadId: string;
  noteId: string;
}) {
  return {
    namespace: input.namespace,
    pinnaId: input.pinnaId,
    threadId: input.threadId,
    noteId: input.noteId,
  };
}
