"use client";

import { useMemo, useState } from "react";
import { api } from "./api";
import { FeedbackDrawer } from "./FeedbackDrawer";
import { timeAgo } from "./format";
import { useLoader } from "./useLoader";
import { Alert, Button, Card, EmptyState, KindBadge, PageHeader, Select, StatusBadge, Toolbar } from "./ui/primitives";

type Reason = "approval" | "check" | "stuck" | "stale";
type Item = {
  id: string;
  reason: Reason;
  title: string;
  kind: string;
  status: string;
  reporterName: string;
  createdAt: string;
  updatedAt: string;
  project: { slug: string; name: string };
  manage: boolean;
  detail?: { verifyResult?: string | null; scopeViolation?: string | null; rolledBack?: boolean; claimedAt?: string | null };
};
type Data = { counts: Record<Reason | "total", number>; items: Item[] };

const GROUPS: { reason: Reason; title: string; hint: string }[] = [
  { reason: "approval", title: "Chờ bạn duyệt", hint: "AI chưa được thấy các góp ý này. Đọc rồi duyệt để AI xử lý, hoặc từ chối nếu không đáng làm." },
  { reason: "check", title: "Cần kiểm lại", hint: "AI đã làm nhưng kiểm chứng trượt, sửa ngoài phạm vi cho phép hoặc phải hoàn tác." },
  { reason: "stuck", title: "Có vẻ bị treo", hint: "Đang ở trạng thái “Đang làm” quá 2 giờ — worker có thể đã dừng." },
  { reason: "stale", title: "Chờ lâu chưa ai nhận", hint: "Đã được phép làm nhưng quá 3 ngày chưa có ai nhận. Giục worker, tự xử lý hoặc từ chối." },
];

function why(it: Item): string {
  const d = it.detail;
  if (it.reason === "check" && d) {
    return [d.verifyResult === "fail" ? "kiểm chứng trượt" : null, d.scopeViolation ? `ngoài phạm vi: ${d.scopeViolation}` : null, d.rolledBack ? "đã hoàn tác" : null].filter(Boolean).join(" · ");
  }
  if (it.reason === "stuck") return `nhận việc ${timeAgo(d?.claimedAt)}`;
  return "";
}

export function Inbox({ projects }: { projects: { slug: string; name: string }[] }) {
  const [project, setProject] = useState("");
  const { data, error, reload } = useLoader<Data>(`/api/admin/inbox${project ? `?project=${encodeURIComponent(project)}` : ""}`, 30000);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const approvable = useMemo(() => (data?.items ?? []).filter((i) => i.reason === "approval" && i.manage), [data]);
  // Chỉ giữ lại những mục còn hiển thị (sau khi tải lại, mục đã xử lý biến mất khỏi tập chọn).
  const chosen = approvable.filter((i) => picked.has(i.id)).map((i) => i.id);

  async function approve(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setErr(null);
    setNote(null);
    const r = await api<{ changed: number; skipped: { id: string; reason: string }[] }>("/api/admin/feedback/bulk", { method: "POST", body: { ids, approved: true } });
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setNote(`Đã duyệt ${r.data.changed} góp ý${r.data.skipped.length ? `, bỏ qua ${r.data.skipped.length}` : ""}.`);
    setPicked(new Set());
    void reload();
  }

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <PageHeader title="Cần bạn quyết định" description="Những góp ý đang chờ một người ra tay: duyệt cho AI, kiểm lại việc AI vừa làm, hoặc gỡ việc bị kẹt. AI không tự quyết những việc này. Trang tự làm mới 30 giây một lần." />
      <Toolbar
        left={
          <Select aria-label="Lọc theo dự án" value={project} onChange={(e) => { setProject(e.target.value); setPicked(new Set()); }} className="w-auto max-w-full">
            <option value="">Mọi dự án</option>
            {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </Select>
        }
      />
      {error || err ? <Alert tone="error" className="mb-3">{err ?? error}</Alert> : null}
      {note ? <Alert tone="ok" className="mb-3">{note}</Alert> : null}
      {!data && !error ? <p className="py-10 text-center text-sm text-muted">Đang tải…</p> : null}
      {data && data.counts.total === 0 ? <EmptyState title="Không có gì cần bạn quyết định">Khi có góp ý chờ duyệt hoặc việc AI cần kiểm lại, chúng sẽ hiện ở đây.</EmptyState> : null}

      <div className="space-y-5">
        {data
          ? GROUPS.map((g) => {
              const rows = data.items.filter((i) => i.reason === g.reason);
              if (!rows.length) return null;
              const canBulk = g.reason === "approval" && approvable.length > 0;
              const allOn = canBulk && approvable.every((i) => picked.has(i.id));
              return (
                <Card key={g.reason} className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
                    <div>
                      <h2 className="text-base font-semibold">{g.title} <span className="font-normal text-muted">({data.counts[g.reason]})</span></h2>
                      <p className="text-[13px] text-muted">{g.hint}</p>
                    </div>
                    {canBulk ? (
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setPicked(allOn ? new Set() : new Set(approvable.map((i) => i.id)))}>{allOn ? "Bỏ chọn" : "Chọn tất cả"}</Button>
                        <Button size="sm" disabled={busy || chosen.length === 0} onClick={() => void approve(chosen)}>{busy ? "Đang duyệt…" : `Duyệt ${chosen.length || ""} đã chọn`.trim()}</Button>
                      </div>
                    ) : null}
                  </div>
                  <ul className="mt-3 divide-y divide-line border-t border-line">
                    {rows.map((it) => (
                      <li key={it.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                        {g.reason === "approval" ? (
                          <input type="checkbox" aria-label={`Chọn: ${it.title}`} className="mt-1 size-4 shrink-0" disabled={!it.manage} checked={picked.has(it.id)} onChange={() => toggle(it.id)} />
                        ) : null}
                        <button type="button" onClick={() => setOpenId(it.id)} className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <span className="min-w-0 flex-1 basis-56 break-words font-medium leading-snug hover:text-brand">{it.title}</span>
                            <span className="flex shrink-0 items-center gap-1.5"><KindBadge kind={it.kind} /><StatusBadge status={it.status} /></span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-muted" suppressHydrationWarning>
                            <span className="font-medium text-fg/80">{it.project.name}</span>
                            <span>{it.reporterName}</span>
                            <span>{timeAgo(it.createdAt)}</span>
                            {why(it) ? <span className="text-amber-700 dark:text-amber-300">{why(it)}</span> : null}
                          </div>
                        </button>
                        {g.reason === "approval" && it.manage ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => void approve([it.id])}>Duyệt</Button> : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })
          : null}
      </div>
      {openId ? <FeedbackDrawer key={openId} id={openId} onClose={() => setOpenId("")} onChanged={() => void reload()} /> : null}
    </>
  );
}
