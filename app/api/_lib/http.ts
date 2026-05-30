import { z } from "zod";

export function jsonOk(data: unknown, status = 200) {
  return Response.json({ ok: true, ...((data as object) ?? {}) }, { status });
}

export function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

export async function parseJson(request: Request) {
  return request.json().catch(() => null);
}

export function zodError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid request.";
}
