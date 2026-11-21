"use client";

import { useMemo, useState } from "react";
import { api } from "./api";
import { formatDateTime, timeAgo } from "./format";
import { useLoader } from "./useLoader";
import { AddButton, ConfirmDialog, Modal } from "./ui/Modal";
import { SecretDialog } from "./ui/SecretDialog";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, SearchInput, Spinner, Toolbar } from "./ui/primitives";

export type KeyRow = { id: string; prefix: string; label: string; revokedAt: string | null; lastUsedAt: string | null; createdAt: string };

/** Bảng khoá dùng chung cho khoá operator và khoá worker của dự án. */
export function KeyTable({ keys, onRevoke }: { keys: KeyRow[]; onRevoke: (k: KeyRow) => void }) {
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {keys.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{k.label}</span>
                {k.revokedAt ? <Badge className="bg-zinc-200 text-zinc-800 dark:bg-zinc-500/20 dark:text-zinc-300">Đã thu hồi</Badge> : <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300">Đang dùng</Badge>}
              </div>
              <div className="mt-0.5 font-mono text-xs text-muted">{k.prefix}…</div>
            </div>
            <div className="text-[13px] leading-snug text-muted" suppressHydrationWarning>
              <div>Tạo {formatDateTime(k.createdAt)}</div>
              <div>{k.lastUsedAt ? `Dùng lần cuối ${timeAgo(k.lastUsedAt)}` : "Chưa dùng"}</div>
            </div>
            {k.revokedAt ? null : (
              <Button variant="secondary" size="sm" onClick={() => onRevoke(k)}>
                Thu hồi
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Hộp thoại cấp khoá: nhập nhãn → gọi API → trả về khoá thô để hiện đúng một lần. */
export function IssueKeyDialog({ open, onClose, endpoint, title, onIssued }: { open: boolean; onClose: () => void; endpoint: string; title: string; onIssued: (key: string) => void }) {
  return open ? <IssueKeyForm onClose={onClose} endpoint={endpoint} title={title} onIssued={onIssued} /> : null;
}

function IssueKeyForm({ onClose, endpoint, title, onIssued }: { onClose: () => void; endpoint: string; title: string; onIssued: (key: string) => void }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ key: string }>(endpoint, { body: { label: label.trim() } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onIssued(r.data.key);
  }
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" form="issue-key-form" disabled={busy || label.trim().length < 2}>
            {busy ? <Spinner /> : null}
            Cấp khoá
          </Button>
        </>
      }
    >
      <form id="issue-key-form" onSubmit={submit} className="space-y-4">
        <Field label="Tên gợi nhớ" hint="Để sau này biết khoá thuộc về ai/máy nào, ví dụ “Claude trên máy của thầy Lâm”.">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}

export function KeysBoard() {
  const { data, error, reload } = useLoader<{ keys: KeyRow[] }>("/api/admin/keys");
  const keys = data?.keys ?? null;
  const [q, setQ] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (keys ?? []).filter((k) => !n || k.label.toLowerCase().includes(n) || k.prefix.toLowerCase().includes(n));
  }, [keys, q]);

  return (
    <>
      <PageHeader
        title="Khoá operator"
        description="Khoá cho Claude, MCP hoặc dòng lệnh: xem và xử lý góp ý của mọi dự án qua API máy. Khoá chỉ hiện một lần khi cấp (hub chỉ lưu bản băm), mất thì cấp lại. Khoá worker của từng dự án nằm trong trang dự án."
      />
      <Toolbar left={<SearchInput value={q} onChange={setQ} placeholder="Tìm khoá theo tên…" />} right={<AddButton onClick={() => setIssuing(true)}>Cấp khoá mới</AddButton>} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      {keys === null && !error ? (
        <p className="py-8 text-center text-sm text-muted">Đang tải…</p>
      ) : keys && keys.length === 0 ? (
        <EmptyState title="Chưa có khoá operator nào">Bấm “Cấp khoá mới” để tạo khoá đầu tiên.</EmptyState>
      ) : shown.length === 0 && keys ? (
        <EmptyState title="Không có khoá khớp từ khoá" />
      ) : (
        <KeyTable keys={shown} onRevoke={setRevoking} />
      )}

      <IssueKeyDialog
        open={issuing}
        onClose={() => setIssuing(false)}
        endpoint="/api/admin/keys"
        title="Cấp khoá operator"
        onIssued={(k) => {
          setIssuing(false);
          setIssued(k);
          void reload();
        }}
      />
      <SecretDialog
        open={!!issued}
        onClose={() => setIssued(null)}
        title="Khoá operator mới"
        value={issued ?? ""}
        warning="Khoá này chỉ hiện MỘT LẦN. Đóng hộp thoại này là không xem lại được — hãy sao chép và cất vào nơi an toàn."
        note={
          <>
            Dùng trong header <code className="font-mono">Authorization: Bearer …</code> khi gọi API máy; thêm <code className="font-mono">?project=&lt;mã dự án&gt;</code> để chọn dự án.
          </>
        }
      />
      <ConfirmDialog
        open={!!revoking}
        danger
        title="Thu hồi khoá operator"
        message={
          <>
            Khoá <strong>{revoking?.label}</strong> ({revoking?.prefix}…) sẽ ngừng dùng được ngay. Các công cụ đang dùng khoá này sẽ báo lỗi cho tới khi bạn cấp khoá mới.
          </>
        }
        confirmLabel="Thu hồi khoá"
        onCancel={() => setRevoking(null)}
        onConfirm={async () => {
          const r = await api(`/api/admin/keys/${revoking!.id}`, { method: "DELETE" });
          if (!r.ok) return r.error;
          setRevoking(null);
          void reload();
        }}
      />
    </>
  );
}
