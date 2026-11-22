"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "./api";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Spinner } from "./ui/primitives";

/** Trang "Tài khoản của tôi": thông tin, dự án được gán và đổi mật khẩu. */
export function AccountPanel({ name, email, superAdmin, projects }: { name: string; email: string; superAdmin: boolean; projects: { slug: string; name: string; role: string }[] }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = again.length > 0 && next !== again;
  const valid = current.length > 0 && next.length >= 10 && next === again;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const r = await api("/api/admin/me/password", { body: { current, next } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setCurrent("");
    setNext("");
    setAgain("");
    setDone(true);
  }

  return (
    <>
      <PageHeader title="Tài khoản của tôi" description="Thông tin đăng nhập, các dự án bạn được phép dùng và đổi mật khẩu." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div>
            <div className="text-base font-semibold">{name}</div>
            <div className="text-sm text-muted">{email}</div>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Quyền của bạn</h2>
            {superAdmin ? (
              <p className="text-sm">Quản trị toàn hub: mọi dự án, tài khoản và khoá operator.</p>
            ) : projects.length === 0 ? (
              <EmptyState title="Chưa được gán dự án nào">Nhờ quản trị hub gán dự án cho tài khoản này.</EmptyState>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {projects.map((p) => (
                  <li key={p.slug} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <Link href={p.role === "Chỉ xem" ? `/board?project=${encodeURIComponent(p.slug)}` : `/projects/${p.slug}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <Badge className="bg-surface-2 text-muted ring-1 ring-inset ring-line">{p.role}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold">Đổi mật khẩu</h2>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Mật khẩu hiện tại">
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </Field>
            <Field label="Mật khẩu mới" hint="Tối thiểu 10 ký tự. Nên dùng mật khẩu chưa từng dùng ở nơi khác.">
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required />
            </Field>
            <Field label="Nhập lại mật khẩu mới" error={mismatch ? "Hai mật khẩu chưa khớp" : null}>
              <Input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required />
            </Field>
            {error ? <Alert tone="error">{error}</Alert> : null}
            {done ? <Alert tone="ok">Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.</Alert> : null}
            <Button type="submit" disabled={busy || !valid}>
              {busy ? <Spinner /> : null}
              Đổi mật khẩu
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
