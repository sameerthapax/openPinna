declare module "bullmq" {
  type QueueOptions = Record<string, unknown>;
  type QueueJobData = Record<string, unknown>;

  export type Job<TData = QueueJobData> = {
    data: TData;
  };

  export class Queue {
    constructor(name: string, opts?: QueueOptions);
    add(name: string, data: QueueJobData): Promise<unknown>;
  }
  export class Worker {
    constructor(
      name: string,
      processor: (...args: never[]) => Promise<unknown>,
      opts?: QueueOptions,
    );
  }
}

declare module "multer" {
  type PathCallback = (error: Error | null, value: string) => void;
  type FileDescriptor = { originalname?: string };
  type DiskStorageOptions = {
    destination?: (req: unknown, file: FileDescriptor, cb: PathCallback) => void;
    filename?: (req: unknown, file: FileDescriptor, cb: PathCallback) => void;
  };
  type MulterOptions = {
    storage?: unknown;
  };
  type MulterFactory = {
    (options?: MulterOptions): unknown;
    diskStorage(options: DiskStorageOptions): unknown;
  };

  const multer: MulterFactory;
  export default multer;
}
