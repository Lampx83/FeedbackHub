import { requireAdminApi } from "@/lib/admin-session";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  return json({ email: a.admin.email, name: a.admin.name, superAdmin: a.admin.superAdmin });
}
