import { ConsoleShell } from "@/components/ConsoleShell";
import { requireAdminPage } from "./auth";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return <ConsoleShell adminName={admin.name} adminEmail={admin.email}>{children}</ConsoleShell>;
}
