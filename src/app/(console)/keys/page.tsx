import { KeysBoard } from "@/components/KeysBoard";
import { requireSuperPage } from "../auth";

export const metadata = { title: "Khoá operator" };

export default async function KeysPage() {
  await requireSuperPage();
  return <KeysBoard />;
}
