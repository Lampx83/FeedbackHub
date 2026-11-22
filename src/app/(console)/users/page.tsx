import { UsersBoard } from "@/components/UsersBoard";
import { requireSuperPage } from "../auth";

export const metadata = { title: "Tài khoản — Feedback Hub" };

export default async function UsersPage() {
  await requireSuperPage();
  return <UsersBoard />;
}
