import multer from "multer";
import path from "node:path";
import { mkdirSync } from "node:fs";

const uploadRoot = process.env.UPLOAD_DIR || "./uploads";
const screenshotRoot = process.env.SCREENSHOT_UPLOAD_DIR || "./screenshots";

function safeFilename(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function createMulterForSource(projectId: string, sessionId: string) {
  const destination = path.join(uploadRoot, `projects/${projectId}/sessions/${sessionId}/sources`);
  mkdirSync(destination, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (_req: any, _file: any, cb: any) => cb(null, destination),
      filename: (_req: any, file: any, cb: any) => cb(null, `${Date.now()}-${safeFilename(file.originalname)}`),
    }),
  });
}

export function createMulterForCapture(projectId: string, sessionId: string) {
  const destination = path.join(uploadRoot, `projects/${projectId}/sessions/${sessionId}/captures`);
  mkdirSync(destination, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (_req: any, _file: any, cb: any) => cb(null, destination),
      filename: (_req: any, file: any, cb: any) => cb(null, `${Date.now()}-${safeFilename(file.originalname)}`),
    }),
  });
}

export function createMulterForScreenshot(projectId: string, sessionId: string) {
  const destination = path.join(screenshotRoot, `projects/${projectId}/sessions/${sessionId}/captures`);
  mkdirSync(destination, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (_req: any, _file: any, cb: any) => cb(null, destination),
      filename: (_req: any, file: any, cb: any) => {
        const normalized = safeFilename(file.originalname || `${Date.now()}-untitled-page.png`);
        cb(null, normalized);
      },
    }),
  });
}
