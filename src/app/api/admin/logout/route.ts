import { BASE_PATH } from "@/lib/base-path";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/admin-session";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: BASE_PATH || "/" });
  return json({ ok: true });
}
