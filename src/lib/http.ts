import { NextResponse } from "next/server";
import type { ZodType, z } from "zod";

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const fail = (status: number, error: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status });

export async function readBody<S extends ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; value: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: fail(400, "Nội dung gửi lên không phải JSON hợp lệ") };
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    return {
      ok: false,
      response: fail(400, r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")),
    };
  }
  return { ok: true, value: r.data };
}
