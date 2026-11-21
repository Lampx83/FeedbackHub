import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/admin-session";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
}
