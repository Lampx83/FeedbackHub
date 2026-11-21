import { KeysBoard } from "@/components/KeysBoard";
import { requireAdminPage } from "../auth";

export const metadata = { title: "Khoá operator — Feedback Hub" };

export default async function KeysPage() {
  await requireAdminPage();
  return <KeysBoard />;
}
