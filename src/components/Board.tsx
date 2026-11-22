"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { FeedbackDrawer } from "./FeedbackDrawer";
import { timeAgo } from "./format";
import { Alert, EmptyState, KindBadge, PageHeader, SearchInput, Select, StatusBadge, Toolbar } from "./ui/primitives";
import { KINDS, KIND_LABEL, OPEN_STATUSES, STATUSES, STATUS_LABEL } from "@/lib/status";

type Item = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  status: string;
  approvedAt: string | null;
  reporterName: string;
  reporterRole: string | null;
  createdAt: string;
  project: { slug: string; name: string };
  _count: { messages: number; attachments: number };
};

export type Filters = { project: string; status: string; kind: string; q: string; id: string; approval?: string };

const OPEN_VALUE = OPEN_STATUSES.join(",");

export function Board({ projects, initial }: { projects: { slug: string; name: string }[]; initial: Filters }) {
  const [project, setProject] = useState(initial.project);
  const [status, setStatus] = useState(initial.status);
  const [kind, setKind] = useState(initial.kind);
  const [approval, setApproval] = useState(initial.approval ?? "");
  const [q, setQ] = useState(initial.q);
  const [dq, setDq] = useState(initial.q);
  const [openId, setOpenId] = useState(initial.id);
  const [items, setItems] = useState<Item[] | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const reload = useRef<() => void>(() => {});

  // Gõ xong 300ms mới gọi API.
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Giữ bộ lọc trên URL để chia sẻ/đánh dấu trang được.
  useEffect(() => {
    const u = new URLSearchParams();
    if (project) u.set("project", project);
    if (status) u.set("status", status);
    if (kind) u.set("kind", kind);
    if (approval) u.set("approval", approval);
    if (dq) u.set("q", dq);
    if (openId) u.set("id", openId);
    const s = u.toString();
    window.history.replaceState(null, "", s ? `/board?${s}` : "/board");
  }, [project, status, kind, approval, dq, openId]);

  // Tải danh sách; làm mới 15 giây một lần khi tab đang hiện.
  useEffect(() => {
    let alive = true;
    const u = new URLSearchParams();
    if (project) u.set("project", project);
    if (status) u.set("status", status);
    if (kind) u.set("kind", kind);
    if (approval) u.set("approval", approval);
    if (dq) u.set("q", dq);
    const url = `/api/admin/feedback?${u.toString()}`;
    async function run() {
      const r = await api<{ items: Item[]; stats: Record<string, number> }>(url);
      if (!alive) return;
      if (r.ok) {
        setItems(r.data.items);
        setStats(r.data.stats);
        setError(null);
      } else setError(r.error);
    }
    reload.current = () => void run();
    void run();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void run();
    }, 15000);
    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [project, status, kind, approval, dq]);

  const statusOptions = useMemo(() => {
    const openCount = OPEN_STATUSES.reduce((n, s) => n + (stats[s] ?? 0), 0);
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    const opts = [
      { value: "", label: `Mọi trạng thái (${total})` },
      { value: OPEN_VALUE, label: `Đang mở (${openCount})` },
      ...STATUSES.map((s) => ({ value: s, label: `${STATUS_LABEL[s]} (${stats[s] ?? 0})` })),
    ];
    if (status && !opts.some((o) => o.value === status)) opts.push({ value: status, label: "Tuỳ chọn trên đường dẫn" });
    return opts;
  }, [stats, status]);

  return (
    <>
      <PageHeader title="Góp ý" description="Mọi góp ý của các dự án trong một bảng. Bấm vào một dòng để xem ngữ cảnh, trao đổi với người gửi và đổi trạng thái. Bảng tự làm mới 15 giây một lần khi tab đang mở." />
      <Toolbar
        left={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Tìm trong tiêu đề và nội dung…" />
            <Select aria-label="Lọc theo dự án" value={project} onChange={(e) => setProject(e.target.value)} className="w-auto max-w-full">
              <option value="">Mọi dự án</option>
              {projects.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Lọc theo trạng thái" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto max-w-full">
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Lọc theo loại" value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto max-w-full">
              <option value="">Mọi loại</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
            <Select aria-label="Lọc theo duyệt" value={approval} onChange={(e) => setApproval(e.target.value)} className="w-auto max-w-full">
              <option value="">Duyệt: tất cả</option>
              <option value="pending">Chưa duyệt</option>
              <option value="approved">Đã duyệt</option>
            </Select>
          </>
        }
      />

      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      {items === null && !error ? (
        <p className="py-10 text-center text-sm text-muted">Đang tải…</p>
      ) : items && items.length === 0 ? (
        <EmptyState title="Không có góp ý nào khớp bộ lọc">Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm.</EmptyState>
      ) : items ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => setOpenId(it.id)} className={`block w-full px-4 py-3 text-left transition hover:bg-surface-2 ${openId === it.id ? "bg-surface-2" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1 basis-64 break-words font-medium leading-snug">{it.title}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <KindBadge kind={it.kind} />
                    <StatusBadge status={it.status} />
                    {it.approvedAt ? <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300">Đã duyệt</span> : null}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted" suppressHydrationWarning>
                  <span className="font-medium text-fg/80">{it.project.name}</span>
                  <span>
                    {it.reporterName}
                    {it.reporterRole ? ` · ${it.reporterRole}` : ""}
                  </span>
                  <span>{timeAgo(it.createdAt)}</span>
                  {it._count.messages ? <span>{it._count.messages} tin nhắn</span> : null}
                  {it._count.attachments ? <span>{it._count.attachments} tệp</span> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {items && items.length >= 300 ? <p className="mt-2 text-[13px] text-muted">Chỉ hiện 300 góp ý mới nhất; dùng bộ lọc để thu hẹp.</p> : null}

      {openId ? <FeedbackDrawer key={openId} id={openId} onClose={() => setOpenId("")} onChanged={() => reload.current()} /> : null}
    </>
  );
}
