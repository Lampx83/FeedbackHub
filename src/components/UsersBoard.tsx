"use client";

import { useMemo, useState } from "react";
import { api } from "./api";
import { formatDateTime } from "./format";
import { useLoader } from "./useLoader";
import { AddButton, ConfirmDialog, Modal } from "./ui/Modal";
import { Alert, Badge, Button, Card, CopyButton, EmptyState, Field, Input, PageHeader, SearchInput, Select, Spinner, Switch, Toolbar } from "./ui/primitives";

type Role = "manager" | "analyst" | "viewer";
type Member = { role: Role; project: { slug: string; name: string } };
type User = { id: string; email: string; name: string; superAdmin: boolean; disabled: boolean; createdAt: string; memberships: Member[] };
type Data = { users: User[]; projects: { slug: string; name: string }[]; selfId: string };

const ROLE_TEXT: Record<Role, string> = { manager: "Quản trị dự án", analyst: "Điều phối yêu cầu (BA)", viewer: "Chỉ xem" };

/** Mật khẩu ngẫu nhiên 16 ký tự (bỏ ký tự dễ nhầm), sinh ngay trên trình duyệt. */
function randomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function UsersBoard() {
  const { data, error, reload } = useLoader<Data>("/api/admin/users");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [toggling, setToggling] = useState<User | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data?.users ?? []).filter((u) => !n || u.name.toLowerCase().includes(n) || u.email.includes(n));
  }, [data, q]);

  return (
    <>
      <PageHeader
        title="Tài khoản"
        description="Người đăng nhập bảng điều khiển này. “Quản trị toàn hub” thấy và làm được mọi thứ; tài khoản thường chỉ thấy các dự án được gán — “Quản trị dự án” (xem, xử lý, cài đặt, cấp khoá) hoặc “Chỉ xem”."
      />
      <Toolbar left={<SearchInput value={q} onChange={setQ} placeholder="Tìm theo tên hoặc email…" />} right={<AddButton onClick={() => setEditing("new")}>Thêm tài khoản</AddButton>} />
      {msg ? <Alert tone="ok" className="mb-3">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!data && !error ? (
        <p className="py-8 text-center text-sm text-muted">Đang tải…</p>
      ) : data && shown.length === 0 ? (
        <EmptyState title="Không có tài khoản khớp" />
      ) : data ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {shown.map((u) => (
              <li key={u.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{u.name}</span>
                    {u.id === data.selfId ? <Badge className="bg-surface-2 text-muted ring-1 ring-inset ring-line">Bạn</Badge> : null}
                    {u.superAdmin ? <Badge className="bg-brand/15 text-brand">Quản trị toàn hub</Badge> : null}
                    {u.disabled ? <Badge className="bg-zinc-200 text-zinc-800 dark:bg-zinc-500/20 dark:text-zinc-300">Đã khoá</Badge> : null}
                  </div>
                  <div className="text-sm text-muted">{u.email}</div>
                  {!u.superAdmin ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {u.memberships.length === 0 ? <span className="text-[13px] text-muted">Chưa được gán dự án nào</span> : null}
                      {u.memberships.map((m) => (
                        <Badge key={m.project.slug} className="bg-surface-2 ring-1 ring-inset ring-line">
                          {m.project.name} · {ROLE_TEXT[m.role]}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="text-[13px] text-muted" suppressHydrationWarning>
                  Tạo {formatDateTime(u.createdAt)}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(u)}>
                    Sửa
                  </Button>
                  {u.id !== data.selfId ? (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setResetting(u)}>
                        Đặt lại mật khẩu
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setToggling(u)}>
                        {u.disabled ? "Mở khoá" : "Khoá"}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setDeleting(u)}>
                        Xoá
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {editing && data ? (
        <UserDialog
          user={editing === "new" ? null : editing}
          projects={data.projects}
          isSelf={editing !== "new" && editing.id === data.selfId}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            setMsg(text);
            void reload();
          }}
        />
      ) : null}
      {resetting ? (
        <ResetDialog
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => {
            setMsg(`Đã đặt lại mật khẩu cho ${resetting.email}. Họ bị đăng xuất khỏi mọi thiết bị.`);
            setResetting(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!toggling}
        danger={!toggling?.disabled}
        title={toggling?.disabled ? "Mở khoá tài khoản" : "Khoá tài khoản"}
        message={toggling?.disabled ? <>Cho phép <strong>{toggling?.email}</strong> đăng nhập lại.</> : <><strong>{toggling?.email}</strong> sẽ không đăng nhập được và bị đăng xuất ngay. Dữ liệu và quyền được gán vẫn giữ để mở khoá lại sau.</>}
        confirmLabel={toggling?.disabled ? "Mở khoá" : "Khoá tài khoản"}
        onCancel={() => setToggling(null)}
        onConfirm={async () => {
          const r = await api(`/api/admin/users/${toggling!.id}`, { method: "PATCH", body: { disabled: !toggling!.disabled } });
          if (!r.ok) return r.error;
          setToggling(null);
          void reload();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        danger
        title="Xoá tài khoản"
        message={<>Xoá hẳn <strong>{deleting?.email}</strong>. Không hoàn tác được; nếu chỉ muốn ngăn đăng nhập, hãy chọn “Khoá”.</>}
        requireText={deleting?.email}
        confirmLabel="Xoá tài khoản"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const r = await api(`/api/admin/users/${deleting!.id}`, { method: "DELETE" });
          if (!r.ok) return r.error;
          setDeleting(null);
          void reload();
        }}
      />
    </>
  );
}

function UserDialog({ user, projects, isSelf, onClose, onSaved }: { user: User | null; projects: { slug: string; name: string }[]; isSelf: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(user?.superAdmin ?? false);
  const [roles, setRoles] = useState<Record<string, Role | "">>(() => Object.fromEntries((user?.memberships ?? []).map((m) => [m.project.slug, m.role])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberships = Object.entries(roles).filter(([, r]) => r).map(([slug, role]) => ({ slug, role: role as Role }));
  const valid = name.trim().length >= 2 && (user ? true : email.includes("@") && password.length >= 10);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = user
      ? await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: { name: name.trim(), ...(isSelf ? {} : { superAdmin }), memberships } })
      : await api("/api/admin/users", { body: { name: name.trim(), email: email.trim(), password, superAdmin, memberships } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onSaved(user ? `Đã lưu ${user.email}.` : `Đã tạo tài khoản ${email.trim().toLowerCase()}. Gửi mật khẩu cho họ qua kênh riêng và dặn đổi ở “Tài khoản của tôi”.`);
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      size="lg"
      title={user ? "Sửa tài khoản" : "Thêm tài khoản"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" form="user-form" disabled={busy || !valid}>
            {busy ? <Spinner /> : null}
            {user ? "Lưu" : "Tạo tài khoản"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Field label="Tên hiển thị">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </Field>
        <Field label="Email đăng nhập" hint={user ? "Không đổi được email của tài khoản đã tạo." : undefined}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!user} required={!user} autoComplete="off" />
        </Field>
        {!user ? (
          <Field label="Mật khẩu ban đầu" hint="Tối thiểu 10 ký tự. Người dùng nên đổi ngay sau khi đăng nhập.">
            <div className="flex gap-2">
              <Input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required className="font-mono" />
              <Button variant="secondary" onClick={() => { setPassword(randomPassword()); setShowPw(true); }}>
                Tạo ngẫu nhiên
              </Button>
              {showPw && password ? <CopyButton text={password} size="md" /> : null}
            </div>
          </Field>
        ) : null}
        <Switch checked={superAdmin} onChange={setSuperAdmin} disabled={isSelf} label="Quản trị toàn hub" description={isSelf ? "Bạn không thể tự hạ quyền của chính mình." : "Thấy và làm được mọi thứ: mọi dự án, tài khoản, khoá operator, tạo/xoá dự án."} />
        {!superAdmin ? (
          <div>
            <div className="mb-1.5 text-sm font-medium">Dự án được phép</div>
            <p className="mb-2 text-[13px] text-muted">“Quản trị dự án”: xem, trả lời/đổi trạng thái góp ý, cài đặt, khoá và khoá ký của dự án đó. “Điều phối yêu cầu (BA)”: xem, tạo yêu cầu chỉnh sửa và trả lời, nhưng không duyệt, không đổi trạng thái, không cài đặt. “Chỉ xem”: chỉ đọc góp ý. Không chọn = không thấy dự án.</p>
            {projects.length === 0 ? (
              <p className="text-sm text-muted">Chưa có dự án nào.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {projects.map((p) => (
                  <li key={p.slug} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="font-mono text-xs text-muted">{p.slug}</div>
                    </div>
                    <Select aria-label={`Vai trò ở ${p.name}`} value={roles[p.slug] ?? ""} onChange={(e) => setRoles((r) => ({ ...r, [p.slug]: e.target.value as Role | "" }))} className="w-auto">
                      <option value="">Không gán</option>
                      <option value="manager">{ROLE_TEXT.manager}</option>
                      <option value="analyst">{ROLE_TEXT.analyst}</option>
                      <option value="viewer">{ROLE_TEXT.viewer}</option>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}

function ResetDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: { password } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone();
  }
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Đặt lại mật khẩu"
      description={`Mật khẩu mới cho ${user.email}. Họ bị đăng xuất khỏi mọi thiết bị.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" form="reset-form" disabled={busy || password.length < 10}>
            {busy ? <Spinner /> : null}
            Đặt mật khẩu
          </Button>
        </>
      }
    >
      <form id="reset-form" onSubmit={submit} className="space-y-4">
        <Field label="Mật khẩu mới" hint="Tối thiểu 10 ký tự. Gửi cho họ qua kênh riêng và dặn đổi lại.">
          <div className="flex gap-2">
            <Input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required className="font-mono" />
            <Button variant="secondary" onClick={() => { setPassword(randomPassword()); setShowPw(true); }}>
              Tạo ngẫu nhiên
            </Button>
            {showPw && password ? <CopyButton text={password} size="md" /> : null}
          </div>
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}
