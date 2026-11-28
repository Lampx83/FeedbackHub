"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { withBase } from "@/lib/base-path";
import { api } from "./api";
import { FeedbackDrawer } from "./FeedbackDrawer";
import { NewRequestDialog } from "./NewRequestDialog";
import { timeAgo } from "./format";
import { Alert, Button, EmptyState, KindBadge, PageHeader, SearchInput, Select, StatusBadge, Toolbar } from "./ui/primitives";
import { KINDS, KIND_LABEL, OPEN_STATUSES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Priority } from "@/lib/status";

type Item = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  status: string;
  approvedAt: string | null;
  priority: string | null;
  reporterName: string;
  reporterRole: string | null;
  createdAt: string;
  project: { slug: string; name: string };
  _count: { messages: number; attachments: number };
};

export type Filters = { project: string; status: string; kind: string; q: string; id: string; approval?: string; sort?: string };

const OPEN_VALUE = OPEN_STATUSES.join(",");

export function Board({ projects, creatable, initial }: { projects: { slug: string; name: string }[]; creatable: { slug: string; name: string }[]; initial: Filters }) {
  const [creating, setCreating] = useState(false);
  const [project, setProject] = useState(initial.project);
  const [status, setStatus] = useState(initial.status);
  const [kind, setKind] = useState(initial.kind);
  const [approval, setApproval] = useState(initial.approval ?? "");
  const [sort, setSort] = useState(initial.sort ?? "new");
  const [q, setQ] = useState(initial.q);
  const [dq, setDq] = useState(initial.q);
  const [openId, setOpenId] = useState(initial.id);
  const [items, setItems] = useState<Item[] | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const reload = useRef<() => void>(() => {});
  // Chọn nhiều để duyệt hàng loạt (chỉ các dòng chưa duyệt).
  // Số dòng muốn xem; đổi bộ lọc thì về 100 (gắn với khoá bộ lọc nên không cần effect đặt lại).
  const filterKey = [project, status, kind, approval, dq, sort].join("|");
  const [lim, setLim] = useState({ key: "", n: 100 });
  const limit = lim.key === filterKey ? lim.n : 100;
  const [focusId, setFocusId] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState<string | null>(null);

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
    if (sort !== "new") u.set("sort", sort);
    if (openId) u.set("id", openId);
    const s = u.toString();
    window.history.replaceState(null, "", s ? `/board?${s}` : "/board");
  }, [project, status, kind, approval, dq, sort, openId]);

  // Tải danh sách; làm mới 15 giây một lần khi tab đang hiện.
  useEffect(() => {
    let alive = true;
    const u = new URLSearchParams();
    if (project) u.set("project", project);
    if (status) u.set("status", status);
    if (kind) u.set("kind", kind);
    if (approval) u.set("approval", approval);
    if (dq) u.set("q", dq);
    if (sort !== "new") u.set("sort", sort);
    u.set("limit", String(limit));
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
  }, [project, status, kind, approval, dq, sort, limit]);

  const pickable = (items ?? []).filter((i) => !i.approvedAt);
  const chosen = pickable.filter((i) => picked.has(i.id)).map((i) => i.id);
  async function bulkApprove() {
    setBulkBusy(true);
    setBulkNote(null);
    const r = await api<{ changed: number; skipped: unknown[] }>("/api/admin/feedback/bulk", { method: "POST", body: { ids: chosen, approved: true } });
    setBulkBusy(false);
    if (!r.ok) return setError(r.error);
    setBulkNote(`Đã duyệt ${r.data.changed} góp ý${r.data.skipped.length ? `, bỏ qua ${r.data.skipped.length} (không đủ quyền hoặc đã duyệt)` : ""}.`);
    setPicked(new Set());
    reload.current();
  }

  const csvHref = useMemo(() => {
    const u = new URLSearchParams({ format: "csv" });
    if (project) u.set("project", project);
    if (status) u.set("status", status);
    if (kind) u.set("kind", kind);
    if (approval) u.set("approval", approval);
    if (dq) u.set("q", dq);
    if (sort !== "new") u.set("sort", sort);
    return withBase(`/api/admin/feedback?${u.toString()}`);
  }, [project, status, kind, approval, dq, sort]);

  // Phím tắt (bỏ qua khi đang gõ): j/k = xuống/lên (đang mở chi tiết thì chuyển sang góp ý kế), Enter = mở,
  // x = chọn/bỏ chọn dòng, / = tìm kiếm. Esc đóng khung chi tiết đã do khung tự lo.
  const move = (dir: 1 | -1) => {
    if (!items?.length) return;
    const cur = items.findIndex((i) => i.id === (openId || focusId));
    const next = items[Math.min(items.length - 1, Math.max(0, cur < 0 ? 0 : cur + dir))];
    setFocusId(next.id);
    if (openId) setOpenId(next.id);
    document.getElementById(`fb-${next.id}`)?.scrollIntoView({ block: "nearest" });
  };
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e) => {
    const t = e.target as HTMLElement | null;
    if (e.metaKey || e.ctrlKey || e.altKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
    if (e.key === "j") move(1);
    else if (e.key === "k") move(-1);
    else if (e.key === "Enter" && focusId && !openId && !t?.closest("button, a")) setOpenId(focusId);
    else if (e.key === "x" && (focusId || openId)) {
      const it = items?.find((i) => i.id === (openId || focusId));
      if (it && !it.approvedAt) setPicked((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; });
    } else if (e.key === "/") {
      e.preventDefault();
      searchRef.current?.querySelector("input")?.focus();
    } else return;
    };
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

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
            <div ref={searchRef} className="contents"><SearchInput value={q} onChange={setQ} placeholder="Tìm trong tiêu đề và nội dung…  ( / )" /></div>
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
            <Select aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto max-w-full">
              <option value="new">Mới nhất trước</option>
              <option value="old">Cũ nhất trước</option>
              <option value="updated">Vừa cập nhật</option>
            </Select>
          </>
        }
        right={<>{creatable.length ? <Button onClick={() => setCreating(true)}>Tạo yêu cầu</Button> : null}<a href={csvHref} download className="inline-flex items-center rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium transition hover:bg-surface-2" title="Tải các góp ý đang lọc (tối đa 5000 dòng) về Excel/CSV">Xuất CSV</a></>}
      />

      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      {bulkNote ? <Alert tone="ok" className="mb-3">{bulkNote}</Alert> : null}
      {chosen.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
          <span className="font-medium">Đã chọn {chosen.length} góp ý</span>
          <Button size="sm" disabled={bulkBusy} onClick={() => void bulkApprove()}>{bulkBusy ? "Đang duyệt…" : "Duyệt để AI xử lý"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Bỏ chọn</Button>
        </div>
      ) : pickable.length > 1 ? (
        <div className="mb-2 text-[13px]"><button type="button" className="text-brand hover:underline" onClick={() => setPicked(new Set(pickable.map((i) => i.id)))}>Chọn {pickable.length} góp ý chưa duyệt</button></div>
      ) : null}
      {items === null && !error ? (
        <p className="py-10 text-center text-sm text-muted">Đang tải…</p>
      ) : items && items.length === 0 ? (
        <EmptyState title="Không có góp ý nào khớp bộ lọc">Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm.</EmptyState>
      ) : items ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {items.map((it) => (
            <li key={it.id} id={`fb-${it.id}`} className={`flex items-start ${focusId === it.id && !openId ? "bg-brand/5 ring-1 ring-inset ring-brand/40" : ""}`}>
              {!it.approvedAt ? (
                <input type="checkbox" aria-label={`Chọn: ${it.title}`} className="ml-4 mt-4 size-4 shrink-0" checked={picked.has(it.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })} />
              ) : <span className="ml-4 w-4 shrink-0" />}
              <button type="button" onClick={() => { setFocusId(it.id); setOpenId(it.id); }} className={`block min-w-0 flex-1 px-3 py-3 text-left transition hover:bg-surface-2 ${openId === it.id ? "bg-surface-2" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1 basis-64 break-words font-medium leading-snug">{it.title}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <KindBadge kind={it.kind} />
                    {it.priority && it.priority !== "normal" ? <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${it.priority === "urgent" ? "bg-red-100 text-red-900 dark:bg-red-400/15 dark:text-red-300" : it.priority === "high" ? "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300" : "bg-surface-2 text-muted ring-1 ring-inset ring-line"}`}>{PRIORITY_LABEL[it.priority as Priority] ?? it.priority}</span> : null}
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
      {items && items.length >= limit ? (
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={() => setLim({ key: filterKey, n: Math.min(1000, limit + 100) })} disabled={limit >= 1000}>
            {limit >= 1000 ? "Đã hiện 1000 dòng — hãy lọc để thu hẹp" : `Hiện thêm (đang hiện ${items.length})`}
          </Button>
        </div>
      ) : items && items.length > 0 ? (
        <p className="mt-2 text-[13px] text-muted">Phím tắt: j / k chuyển dòng · Enter mở · x chọn · / tìm kiếm.</p>
      ) : null}

      {creating ? <NewRequestDialog open projects={creatable} defaultProject={project} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setFocusId(id); setOpenId(id); reload.current(); }} /> : null}
      {openId ? <FeedbackDrawer key={openId} id={openId} onClose={() => setOpenId("")} onChanged={() => reload.current()} onPrev={items && items.findIndex((i) => i.id === openId) > 0 ? () => move(-1) : undefined} onNext={items && items.findIndex((i) => i.id === openId) >= 0 && items.findIndex((i) => i.id === openId) < items.length - 1 ? () => move(1) : undefined} /> : null}
    </>
  );
}
