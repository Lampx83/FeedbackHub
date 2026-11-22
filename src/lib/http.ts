import { NextResponse } from "next/server";
import type { ZodType, z } from "zod";

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const fail = (status: number, error: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...extra }, { status });

export async function readBody<S extends ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; value: z.infer<S> } | { ok: false; response: NextResponse }> {
  // Chặn thân yêu cầu quá lớn trước khi đọc vào bộ nhớ (trần 2 MB; tệp đính kèm đi đường multipart riêng).
  if (Number(req.headers.get("content-length") ?? 0) > 2 * 1024 * 1024) {
    return { ok: false, response: fail(413, "Nội dung gửi lên quá lớn") };
  }
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
