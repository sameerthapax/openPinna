import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

type MulterMiddleware = (
  req: Readable & {
    body?: Record<string, unknown>;
    file?: {
      path?: string;
      filename?: string;
      originalname?: string;
      mimetype?: string;
      size?: number;
    };
    files?: unknown;
    headers: Record<string, string>;
    method: string;
    url: string;
  },
  res: EventEmitter,
  callback: (error?: unknown) => void,
) => void;

// Next.js route handlers expose Web Request objects. This adapter lets Multer parse them in Node runtime.
export async function runMulter(request: Request, middleware: MulterMiddleware) {
  const bodyStream = request.body ? Readable.fromWeb(request.body as never) : new Readable({ read() {} });
  const req = bodyStream as Readable & {
    body?: Record<string, unknown>;
    file?: {
      path?: string;
      filename?: string;
      originalname?: string;
      mimetype?: string;
      size?: number;
    };
    files?: unknown;
    headers: Record<string, string>;
    method: string;
    url: string;
  };

  req.headers = Object.fromEntries(request.headers.entries());
  req.method = request.method;
  req.url = request.url;
  req.body = {};

  const res = new EventEmitter();

  await new Promise<void>((resolve, reject) => {
    middleware(req, res, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return req;
}
