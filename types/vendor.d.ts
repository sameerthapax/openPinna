declare module "bullmq" {
  export class Queue {
    constructor(name: string, opts?: any);
    add(name: string, data: any): Promise<any>;
  }
  export class Worker {
    constructor(name: string, processor: (job: any) => Promise<any>, opts?: any);
  }
}

declare module "multer" {
  const multer: any;
  export default multer;
}
