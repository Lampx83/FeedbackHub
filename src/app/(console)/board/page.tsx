import { prisma } from "@/lib/prisma";
import { Board } from "@/components/Board";
import { requireAdminPage } from "../auth";

export const metadata = { title: "Góp ý — Feedback Hub" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function BoardPage({ searchParams }: { searchParams: SP }) {
  await requireAdminPage();
  const sp = await searchParams;
  const projects = await prisma.project.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } });
  return <Board projects={projects} initial={{ project: one(sp.project), status: one(sp.status), kind: one(sp.kind), q: one(sp.q), id: one(sp.id) }} />;
}
