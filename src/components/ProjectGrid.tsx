"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "./api";
import { DELIVER_LABEL, MODE_LABEL, isHttpOrigin, slugify } from "./labels";
import { isRecent, timeAgo } from "./format";
import { AddButton, Modal } from "./ui/Modal";
import { SecretDialog } from "./ui/SecretDialog";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, SearchInput, Spinner, TagsInput, Toolbar } from "./ui/primitives";

export type ProjectCard = { slug: string; name: string; mode: string; deliver: string; workerSeenAt: string | null; openCount: number };

export function ProjectGrid({ projects, total }: { projects: ProjectCard[]; total: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ slug: string; name: string; secret: string } | null>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? projects.filter((p) => p.name.toLowerCase().includes(n) || p.slug.includes(n)) : projects;
  }, [projects, q]);

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={`Mỗi thẻ là một ứng dụng đang dùng hub để thu góp ý. Hiện có ${projects.length} dự án và ${total} góp ý. Số "đang mở" không tính câu hỏi thuần.`}
      />
      <Toolbar left={<SearchInput value={q} onChange={setQ} placeholder="Tìm dự án theo tên hoặc mã…" />} right={<AddButton onClick={() => setAdding(true)}>Thêm dự án</AddButton>} />

      {projects.length === 0 ? (
        <EmptyState title="Chưa có dự án nào">Bấm “Thêm dự án” để kết nối ứng dụng đầu tiên.</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="Không có dự án khớp từ khoá" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <li key={p.slug}>
              <ProjectCardView p={p} />
            </li>
          ))}
        </ul>
      )}

      <AddProjectDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(c) => {
          setAdding(false);
          setCreated(c);
          router.refresh();
        }}
      />
      <SecretDialog
        open={!!created}
        onClose={() => {
          const slug = created?.slug;
          setCreated(null);
          if (slug) router.push(`/projects/${slug}`);
        }}
        title={`Dự án “${created?.name ?? ""}” đã được tạo`}
        value={created?.secret ?? ""}
        warning="Khoá ký token này đặt trong MÁY CHỦ của ứng dụng (biến môi trường), KHÔNG đưa lên trình duyệt hay mã giao diện."
        note={
          <>
            Đây là khoá để ứng dụng ký token cho người dùng. Bạn vẫn xem lại được ở tab “Khoá &amp; nhúng” của dự án, nhưng nên lưu ngay vào nơi an toàn.
          </>
        }
      />
    </>
  );
}

function ProjectCardView({ p }: { p: ProjectCard }) {
  const seen = p.workerSeenAt;
  const live = isRecent(seen, 5 * 60_000);
  return (
    <Card className="flex h-full flex-col p-4 transition hover:border-brand/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/projects/${p.slug}`} className="block truncate text-base font-semibold hover:text-brand">
            {p.name}
          </Link>
          <div className="truncate font-mono text-xs text-muted">{p.slug}</div>
        </div>
        <Badge className={p.mode === "execute" ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted ring-1 ring-inset ring-line"}>{MODE_LABEL[p.mode] ?? p.mode}</Badge>
      </div>
      {p.mode === "execute" ? <p className="mt-2 text-[13px] text-muted">Giao kết quả: {DELIVER_LABEL[p.deliver] ?? p.deliver}</p> : null}
      <div className="mt-4 flex items-end justify-between gap-3">
        <Link href={`/board?project=${encodeURIComponent(p.slug)}&status=pending,reviewing,deploying,awaiting_user`} className="group">
          <div className="text-3xl font-semibold leading-none tabular-nums group-hover:text-brand">{p.openCount}</div>
          <div className="mt-1 text-[13px] text-muted">góp ý đang mở</div>
        </Link>
        <div className="flex items-center gap-1.5 text-right text-[13px] text-muted" suppressHydrationWarning>
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${live ? "bg-emerald-500" : "bg-zinc-400/60"}`} />
          {seen ? `worker thấy lần cuối ${timeAgo(p.workerSeenAt)}` : "chưa có worker"}
        </div>
      </div>
    </Card>
  );
}

function AddProjectDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: { slug: string; name: string; secret: string }) => void }) {
  return open ? <AddProjectForm onClose={onClose} onCreated={onCreated} /> : null;
}

function AddProjectForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: { slug: string; name: string; secret: string }) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [origins, setOrigins] = useState<string[]>([]);
  const [submitRoles, setSubmitRoles] = useState<string[]>([]);
  const [adminRoles, setAdminRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ signingSecret: string; project: { slug: string; name: string } }>("/api/admin/projects", {
      body: { slug, name: name.trim(), allowedOrigins: origins, submitRoles, adminRoles },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onCreated({ slug: r.data.project.slug, name: r.data.project.name, secret: r.data.signingSecret });
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Thêm dự án"
      description="Kết nối một ứng dụng mới với hub. Các cài đặt khác chỉnh sau trong trang dự án."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" form="add-project-form" disabled={busy || name.trim().length < 2 || !slug}>
            {busy ? <Spinner /> : null}
            Tạo dự án
          </Button>
        </>
      }
    >
      <form id="add-project-form" onSubmit={submit} className="space-y-4">
        <Field label="Tên dự án" hint="Tên hiển thị, ví dụ “Hệ thống Đánh giá Xếp loại”.">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Mã dự án" hint="Chữ thường, số, gạch ngang (2–41 ký tự). Không đổi được sau khi tạo; nằm trong token và đường dẫn.">
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            pattern="[a-z0-9][a-z0-9\-]{1,40}"
            className="font-mono"
            required
          />
        </Field>
        <Field label="Tên miền được phép" hint="Địa chỉ gốc của ứng dụng, ví dụ https://app.example.com. Bỏ trống nếu chỉ gọi từ máy chủ.">
          <TagsInput value={origins} onChange={setOrigins} validate={isHttpOrigin} placeholder="https://…  (Enter để thêm)" />
        </Field>
        <Field label="Vai trò được gửi góp ý" hint="Bỏ trống = mọi người có token hợp lệ.">
          <TagsInput value={submitRoles} onChange={setSubmitRoles} placeholder="vd. STAFF  (Enter để thêm)" />
        </Field>
        <Field label="Vai trò quản trị" hint="Xem và xử lý mọi góp ý của dự án; vai trò khác chỉ thấy góp ý của chính mình.">
          <TagsInput value={adminRoles} onChange={setAdminRoles} placeholder="vd. ADMIN  (Enter để thêm)" />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}
