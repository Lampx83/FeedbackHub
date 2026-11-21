import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Đăng nhập — Feedback Hub" };

export default async function LoginPage() {
  if (await currentAdmin()) redirect("/");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Feedback Hub</h1>
          <p className="mt-1 text-sm text-muted">Đăng nhập để vào bảng điều khiển</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
