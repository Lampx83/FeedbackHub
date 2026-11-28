"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "./api";
import { useLoader } from "./useLoader";
import { SecretDialog } from "./ui/SecretDialog";
import { timeAgo } from "./format";
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
                    <Link href={(p.role === "Chỉ xem" || p.role === "Điều phối yêu cầu (BA)") ? `/board?project=${encodeURIComponent(p.slug)}` : `/projects/${p.slug}`} className="font-medium hover:underline">
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

      <TokensCard />
    </>
  );
}

type Tok = { id: string; label: string; prefix: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null; createdAt: string };

/** Token cá nhân cho CLI/script/Claude Code: dùng thay mật khẩu, có hạn, thu hồi được. */
function TokensCard() {
  const { data, reload } = useLoader<{ tokens: Tok[] }>("/api/admin/me/tokens");
  const list = data?.tokens ?? null;
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ token: string }>("/api/admin/me/tokens", { body: { label: label.trim(), days } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setLabel("");
    setFresh(r.data.token);
    void reload();
  }
  async function revoke(id: string) {
    await api(`/api/admin/me/tokens/${id}`, { method: "DELETE" });
    void reload();
  }
  const active = list ?? [];

  return (
    <Card className="mt-4 p-5">
      <h2 className="mb-1 text-base font-semibold">Token truy cập cá nhân</h2>
      <p className="mb-4 text-sm text-muted">
        Cho Claude Code, script hay dòng lệnh làm việc với hub <b>đúng quyền của bạn</b> mà không phải gõ mật khẩu (vd. <code>HUB_ADMIN_TOKEN=… node scripts/setup-project.mjs …</code>).
        Token chỉ hiện một lần, có hạn, thu hồi được ngay, và tự bị thu hồi khi đổi mật khẩu. Token không cấp được token khác.
      </p>
      <form onSubmit={create} className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="Tên gọi nhớ" hint="vd. “Claude Code trên MacBook”">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} minLength={2} maxLength={60} required />
        </Field>
        <Field label="Hiệu lực">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm">
            <option value={7}>7 ngày</option>
            <option value={30}>30 ngày</option>
            <option value={90}>90 ngày</option>
            <option value={365}>1 năm</option>
          </select>
        </Field>
        <Button type="submit" disabled={busy || label.trim().length < 2}>
          {busy ? <Spinner /> : null}
          Cấp token
        </Button>
      </form>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {list === null ? (
        <Spinner />
      ) : active.length === 0 ? (
        <p className="text-sm text-muted">Chưa có token nào còn hiệu lực.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {active.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{t.label}</span> <code className="text-xs text-muted">{t.prefix}…</code>
                <div className="text-xs text-muted">
                  Hết hạn {new Date(t.expiresAt).toLocaleDateString("vi-VN")} · {t.lastUsedAt ? `dùng ${timeAgo(t.lastUsedAt)}` : "chưa dùng"}
                </div>
              </div>
              <Button variant="secondary" onClick={() => void revoke(t.id)}>
                Thu hồi
              </Button>
            </li>
          ))}
        </ul>
      )}
      <SecretDialog
        open={!!fresh}
        onClose={() => setFresh(null)}
        title="Token đã được cấp"
        value={fresh ?? ""}
        warning="Chỉ hiện một lần. Lưu vào nơi an toàn (trình quản lý mật khẩu hoặc tệp quyền 600), đừng dán vào chat hay commit."
      />
    </Card>
  );
}
