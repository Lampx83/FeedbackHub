import { hubName } from "@/lib/env";
import { ConsoleShell } from "@/components/ConsoleShell";
import { requireAdminPage } from "./auth";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return <ConsoleShell hubName={hubName()} adminName={admin.name} adminEmail={admin.email} superAdmin={admin.superAdmin}>{children}</ConsoleShell>;
}
