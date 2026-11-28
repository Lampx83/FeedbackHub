import { projectFilter, projectScope, ROLE_LABEL } from "@/lib/admin-access";
import { prisma } from "@/lib/prisma";
import { AccountPanel } from "@/components/AccountPanel";
import { requireAdminPage } from "../auth";

export const metadata = { title: "Tài khoản của tôi" };

export default async function AccountPage() {
  const admin = await requireAdminPage();
  const scope = await projectScope(admin);
  const projects = await prisma.project.findMany({ where: projectFilter(scope), orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } });
  return (
    <AccountPanel
      name={admin.name}
      email={admin.email}
      superAdmin={admin.superAdmin}
      projects={projects.map((p) => ({ slug: p.slug, name: p.name, role: scope.all ? "Quản trị toàn hub" : ROLE_LABEL[scope.roles.get(p.id)!] }))}
    />
  );
}
