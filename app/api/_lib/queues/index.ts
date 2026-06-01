import { Queue } from "bullmq";

const connection = { url: process.env.REDIS_URL };

export const threadMemoryQueue = new Queue("threadMemoryQueue", { connection });
export const noteMemoryQueue = new Queue("noteMemoryQueue", { connection });
export const sessionMemoryQueue = new Queue("sessionMemoryQueue", { connection });
export const projectMemoryQueue = new Queue("projectMemoryQueue", { connection });
export const graphQueue = new Queue("graphQueue", { connection });
export const sourceProcessingQueue = new Queue("sourceProcessingQueue", { connection });
