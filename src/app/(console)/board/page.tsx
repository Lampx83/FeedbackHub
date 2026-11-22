import { prisma } from "@/lib/prisma";
import { Board } from "@/components/Board";
import { projectFilter, projectScope } from "@/lib/admin-access";
import { requireAdminPage } from "../auth";

export const metadata = { title: "Góp ý — Feedback Hub" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function BoardPage({ searchParams }: { searchParams: SP }) {
  const admin = await requireAdminPage();
  const sp = await searchParams;
  const scope = await projectScope(admin);
  const projects = await prisma.project.findMany({ where: projectFilter(scope), orderBy: { name: "asc" }, select: { slug: true, name: true } });
  return <Board projects={projects} initial={{ project: one(sp.project), status: one(sp.status), kind: one(sp.kind), q: one(sp.q), id: one(sp.id), approval: one(sp.approval) }} />;
}
