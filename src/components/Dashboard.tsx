"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { timeAgo } from "./format";
import { useLoader } from "./useLoader";
import { Alert, Badge, Card, KindBadge, Select, StatusBadge } from "./ui/primitives";
import { KIND_LABEL, STATUSES, STATUS_LABEL, type Status } from "@/lib/status";

type Day = { date: string; created: number; done: number };
type Row = { id: string; title: string; status: string; kind: string; createdAt: string; approvedAt?: string | null; reporterName?: string; project: { slug: string; name: string } };
type Stats = {
  days: number;
  kpi: { open: number; awaiting: number; bugsOpen: number; created: number; createdPrev: number; done: number; avgResolveSeconds: number | null; awaitingApproval: number; approvalEnabled: boolean };
  series: Day[];
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  byProject: { slug: string; name: string; open: number; bugs: number; created: number; last: string | null }[];
  attention: Row[];
  recent: Row[];
};

const PERIODS = [7, 30, 90] as const;

function duration(sec: number | null): string {
  if (sec === null) return "—";
  const h = sec / 3600;
  if (h < 1) return `${Math.max(1, Math.round(sec / 60))} phút`;
  if (h < 48) return `${Math.round(h)} giờ`;
  return `${Math.round(h / 24)} ngày`;
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Tile({ label, value, sub, href, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; tone?: "warn" }) {
  const body = (
    <Card className={`h-full p-4 transition ${href ? "hover:border-brand/60" : ""}`}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className={`mt-1 text-3xl font-semibold leading-none tabular-nums ${tone === "warn" ? "text-amber-700 dark:text-amber-300" : ""}`}>{value}</div>
      {sub ? <div className="mt-1.5 text-[13px] text-muted">{sub}</div> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Đường 2px, chấm ≥ 8px có viền nền khi di chuột, lưới mờ, chú giải luôn có, kèm bảng số liệu cho người không nhìn được màu. */
function TrendChart({ series }: { series: Day[] }) {
  const W = 720, H = 230, ml = 34, mr = 10, mt = 10, mb = 26;
  const iw = W - ml - mr, ih = H - mt - mb;
  const n = series.length;
  const peak = Math.max(1, ...series.flatMap((s) => [s.created, s.done]));
  const max = Math.ceil(peak / 4) * 4; // chia hết cho 4 để các vạch lưới là số nguyên
  const x = (i: number) => ml + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => mt + ih - (v / max) * ih;
  const line = (k: "created" | "done") => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(" ");
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();
  const step = Math.max(1, Math.ceil(n / 6));
  const totals = series.reduce((t, s) => ({ c: t.c + s.created, d: t.d + s.done }), { c: 0, d: 0 });
  const h = hover === null ? null : series[hover];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: "var(--series-1)" }} aria-hidden />Góp ý mới <strong className="tabular-nums">{totals.c}</strong></span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: "var(--series-2)" }} aria-hidden />Đã hoàn thành <strong className="tabular-nums">{totals.d}</strong></span>
      </div>
      <div className="relative">
        <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full min-w-[34rem]" role="img" aria-label={`Số góp ý mới và đã hoàn thành mỗi ngày trong ${n} ngày qua. Xem bảng số liệu bên dưới để đọc chi tiết.`}>
          {[0, 1, 2, 3, 4].map((k) => {
            const v = (max / 4) * k;
            return (
              <g key={k}>
                <line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" strokeDasharray={k ? "3 4" : undefined} />
                <text x={ml - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v}</text>
              </g>
            );
          })}
          {series.map((s, i) => (i % step === 0 || i === n - 1) && (n - 1 - i >= step / 2 || i === n - 1) ? (
            <text key={s.date} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted)">{dm(s.date)}</text>
          ) : null)}
          <path d={line("done")} fill="none" stroke="var(--series-2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={line("created")} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && h ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={mt} y2={mt + ih} stroke="var(--muted)" strokeWidth="1" opacity="0.5" />
              <circle cx={x(hover)} cy={y(h.done)} r="4.5" fill="var(--series-2)" stroke="var(--surface)" strokeWidth="2" />
              <circle cx={x(hover)} cy={y(h.created)} r="4.5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
            </g>
          ) : null}
          <rect
            x={ml} y={mt} width={iw} height={ih} fill="transparent"
            onPointerMove={(e) => {
              const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
              const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
              setHover(Math.max(0, Math.min(n - 1, i)));
            }}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        </div>
        {hover !== null && h ? (
          <div className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-lg" style={{ left: `${Math.min(80, Math.max(2, (x(hover) / W) * 100 - 8))}%` }}>
            <div className="mb-1 font-medium">{dm(h.date)}/{h.date.slice(0, 4)}</div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--series-1)" }} aria-hidden />Mới <strong className="ml-auto pl-4 tabular-nums">{h.created}</strong></div>
            <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--series-2)" }} aria-hidden />Hoàn thành <strong className="ml-auto pl-4 tabular-nums">{h.done}</strong></div>
          </div>
        ) : null}
      </div>
      <details className="mt-2 text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-fg" aria-controls={tableId}>Xem dạng bảng</summary>
        <div id={tableId} className="mt-2 max-h-56 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-surface-2 text-muted"><tr><th className="px-3 py-1.5 font-medium">Ngày</th><th className="px-3 py-1.5 font-medium">Mới</th><th className="px-3 py-1.5 font-medium">Hoàn thành</th></tr></thead>
            <tbody>{[...series].reverse().map((s) => <tr key={s.date} className="border-t border-line"><td className="px-3 py-1">{dm(s.date)}/{s.date.slice(0, 4)}</td><td className="px-3 py-1">{s.created}</td><td className="px-3 py-1">{s.done}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Thanh ngang một màu cho độ lớn; nhãn và số luôn là chữ, không chỉ màu. */
function BarRows({ rows, href }: { rows: { key: string; label: string; value: number }[]; href?: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="font-medium tabular-nums">{r.value}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(r.value ? 3 : 0, (r.value / max) * 100)}%`, background: "var(--series-1)" }} />
            </div>
          </>
        );
        return <li key={r.key}>{href ? <Link href={href(r.key)} className="block rounded-md hover:bg-surface-2">{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}

function FeedList({ items, approvalEnabled, empty }: { items: Row[]; approvalEnabled?: boolean; empty: string }) {
  if (!items.length) return <p className="py-3 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((it) => (
        <li key={it.id}>
          <Link href={`/board?project=${encodeURIComponent(it.project.slug)}&id=${it.id}`} className="block py-2.5 hover:bg-surface-2/60">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 flex-1 basis-48 break-words text-sm font-medium leading-snug">{it.title}</span>
              <span className="flex items-center gap-1.5"><KindBadge kind={it.kind} /><StatusBadge status={it.status} />{approvalEnabled && !it.approvedAt ? <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300">Chưa duyệt</Badge> : null}</span>
            </div>
            <div className="mt-0.5 text-[13px] text-muted" suppressHydrationWarning>{it.project.name} · {it.reporterName ? `${it.reporterName} · ` : ""}{timeAgo(it.createdAt)}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Dashboard({ projects }: { projects: { slug: string; name: string }[] }) {
  const [days, setDays] = useState<number>(30);
  const [project, setProject] = useState("");
  const { data, error } = useLoader<Stats>(`/api/admin/stats?days=${days}${project ? `&project=${encodeURIComponent(project)}` : ""}`, 30000);
  const k = data?.kpi;
  const delta = useMemo(() => {
    if (!k) return null;
    if (k.createdPrev === 0) return k.created > 0 ? "tăng so với kỳ trước" : null;
    const p = Math.round(((k.created - k.createdPrev) / k.createdPrev) * 100);
    return `${p >= 0 ? "+" : ""}${p}% so với ${data!.days} ngày trước`;
  }, [k, data]);
  const statusRows = useMemo(() => STATUSES.map((s: Status) => ({ key: s, label: STATUS_LABEL[s], value: data?.byStatus[s] ?? 0 })), [data]);
  const kindRows = useMemo(() => Object.entries(data?.byKind ?? {}).filter(([kd]) => kd !== "question").map(([kd, v]) => ({ key: kd, label: KIND_LABEL[kd as keyof typeof KIND_LABEL] ?? kd, value: v })).sort((a, b) => b.value - a.value), [data]);

  return (
    <section aria-label="Dashboard" className="mb-8 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tổng quan</h1>
          <p className="mt-0.5 text-sm text-muted">Số liệu góp ý của {project ? "dự án đã chọn" : "mọi dự án bạn được phép xem"}. Câu hỏi thuần không tính vào việc đang mở.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {projects.length > 1 ? (
            <Select aria-label="Lọc dashboard theo dự án" value={project} onChange={(e) => setProject(e.target.value)} className="w-auto max-w-full">
              <option value="">Mọi dự án</option>
              {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </Select>
          ) : null}
          <div role="group" aria-label="Khoảng thời gian" className="inline-flex overflow-hidden rounded-lg border border-line">
            {PERIODS.map((d) => (
              <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`px-3 py-1.5 text-sm transition ${days === d ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-surface-2"}`}>{d} ngày</button>
            ))}
          </div>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {!data && !error ? <p className="py-8 text-center text-sm text-muted">Đang tải số liệu…</p> : null}

      {data && k ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Đang mở" value={k.open} sub="chờ nhận, đang làm, chờ người gửi" href={`/board?${project ? `project=${encodeURIComponent(project)}&` : ""}status=pending,reviewing,deploying,awaiting_user`} />
            <Tile label={`Mới trong ${data.days} ngày`} value={k.created} sub={delta ?? "chưa có kỳ trước để so"} />
            <Tile label={`Hoàn thành trong ${data.days} ngày`} value={k.done} sub={k.avgResolveSeconds === null ? "chưa có việc nào xong trong kỳ" : `trung bình ${duration(k.avgResolveSeconds)} từ lúc gửi`} />
            <Tile label="Lỗi đang mở" value={k.bugsOpen} sub={k.awaiting ? `${k.awaiting} đang chờ người gửi trả lời` : "báo lỗi chưa xong"} href={`/board?${project ? `project=${encodeURIComponent(project)}&` : ""}kind=bug&status=pending,reviewing,deploying,awaiting_user`} tone={k.bugsOpen ? "warn" : undefined} />
          </div>
          {k.approvalEnabled ? (
            <Alert tone={k.awaitingApproval ? "warn" : "info"}>
              {k.awaitingApproval ? <><strong>{k.awaitingApproval}</strong> góp ý đang chờ bạn duyệt trước khi AI xử lý. </> : "Không có góp ý nào chờ duyệt. "}
              <Link href={`/board?${project ? `project=${encodeURIComponent(project)}&` : ""}approval=pending&status=pending,reviewing`} className="font-medium underline">Mở danh sách chưa duyệt</Link>
            </Alert>
          ) : null}

          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 text-base font-semibold">Xu hướng {data.days} ngày</h2>
            <TrendChart series={data.series} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-5">
              <h2 className="mb-3 text-base font-semibold">Theo trạng thái</h2>
              <BarRows rows={statusRows} href={(s) => `/board?${project ? `project=${encodeURIComponent(project)}&` : ""}status=${s}`} />
            </Card>
            <Card className="p-4 sm:p-5">
              <h2 className="mb-3 text-base font-semibold">Loại góp ý mới ({data.days} ngày)</h2>
              {kindRows.length ? <BarRows rows={kindRows} href={(kd) => `/board?${project ? `project=${encodeURIComponent(project)}&` : ""}kind=${kd}`} /> : <p className="text-sm text-muted">Chưa có góp ý mới trong kỳ này.</p>}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-5">
              <h2 className="text-base font-semibold">Cần chú ý</h2>
              <p className="mb-1 text-[13px] text-muted">Việc chờ lâu nhất, chưa xong.</p>
              <FeedList items={data.attention} approvalEnabled={k.approvalEnabled} empty="Không có việc nào đang chờ. 🎉" />
            </Card>
            <Card className="p-4 sm:p-5">
              <h2 className="text-base font-semibold">Mới nhất</h2>
              <p className="mb-1 text-[13px] text-muted">Góp ý vừa gửi.</p>
              <FeedList items={data.recent} approvalEnabled={k.approvalEnabled} empty="Chưa có góp ý nào." />
            </Card>
          </div>

          {!project && data.byProject.length > 1 ? (
            <Card className="overflow-hidden">
              <div className="px-4 pt-4 sm:px-5"><h2 className="text-base font-semibold">Theo dự án</h2></div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="text-[13px] text-muted"><tr><th className="px-4 py-2 font-medium sm:px-5">Dự án</th><th className="px-3 py-2 text-right font-medium">Đang mở</th><th className="px-3 py-2 text-right font-medium">Lỗi mở</th><th className="px-3 py-2 text-right font-medium">Mới ({data.days}n)</th><th className="px-4 py-2 text-right font-medium sm:px-5">Góp ý gần nhất</th></tr></thead>
                  <tbody>
                    {data.byProject.map((p) => (
                      <tr key={p.slug} className="border-t border-line hover:bg-surface-2/60">
                        <td className="px-4 py-2 sm:px-5"><Link href={`/board?project=${encodeURIComponent(p.slug)}`} className="font-medium hover:text-brand">{p.name}</Link></td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.open}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${p.bugs ? "font-medium text-amber-700 dark:text-amber-300" : ""}`}>{p.bugs}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.created}</td>
                        <td className="px-4 py-2 text-right text-muted sm:px-5" suppressHydrationWarning>{p.last ? timeAgo(p.last) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
