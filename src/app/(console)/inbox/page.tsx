import { prisma } from "@/lib/prisma";
import { Inbox } from "@/components/Inbox";
import { projectFilter, projectScope } from "@/lib/admin-access";
import { requireAdminPage } from "../auth";

export const metadata = { title: "Cần quyết định — Feedback Hub" };

export default async function InboxPage() {
  const admin = await requireAdminPage();
  const scope = await projectScope(admin);
  const projects = await prisma.project.findMany({ where: projectFilter(scope), orderBy: { name: "asc" }, select: { slug: true, name: true } });
  return <Inbox projects={projects} />;
}
