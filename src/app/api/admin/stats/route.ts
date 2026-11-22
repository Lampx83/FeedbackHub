import { Prisma } from "@prisma/client";
import { projectFilter, projectScope } from "@/lib/admin-access";
import { requireAdminApi } from "@/lib/admin-session";
import { json } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { projectFeatures } from "@/lib/project-config";
import { OPEN_STATUSES } from "@/lib/status";

export const runtime = "nodejs";

const TZ = "Asia/Ho_Chi_Minh";
const DAY = 86_400_000;
/** Ngày (YYYY-MM-DD) theo giờ Việt Nam. */
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/**
 * Số liệu cho dashboard. Luôn ràng theo dự án mà tài khoản được phép (kể cả khi lọc ?project=).
 * Câu hỏi thuần (`kind=question`) không tính vào việc đang mở, giống bảng tổng quan.
 * Query: days (7–180, mặc định 30), project (mã dự án, tuỳ chọn).
 */
export async function GET(req: Request) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const u = new URL(req.url).searchParams;
  const days = Math.min(180, Math.max(7, Math.floor(Number(u.get("days"))) || 30));
  const scope = await projectScope(a.admin);
  const projects = await prisma.project.findMany({
    where: { ...projectFilter(scope), ...(u.get("project") ? { slug: u.get("project")! } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, mode: true, features: true },
  });
  const ids = projects.map((p) => p.id);

  // Mốc thời gian: đầu ngày (giờ VN) của `days` ngày gần nhất.
  const today = new Date();
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) labels.push(ymd(new Date(today.getTime() - i * DAY)));
  const since = new Date(`${labels[0]}T00:00:00+07:00`);
  const prevSince = new Date(since.getTime() - days * DAY);

  const empty = {
    days,
    kpi: { open: 0, awaiting: 0, bugsOpen: 0, created: 0, createdPrev: 0, done: 0, avgResolveSeconds: null as number | null, awaitingApproval: 0, approvalEnabled: false },
    series: labels.map((d) => ({ date: d, created: 0, done: 0 })),
    byStatus: {} as Record<string, number>,
    byKind: {} as Record<string, number>,
    byProject: [] as unknown[],
    attention: [] as unknown[],
    recent: [] as unknown[],
  };
  if (ids.length === 0) return json(empty);

  const inIds = Prisma.join(ids);
  const notQ = { kind: { not: "question" } } as const;
  const [createdRows, doneRows, statusG, kindG, openByProject, bugsByProject, newByProject, lastByProject, createdPrev, resolve, attention, recent] = await Promise.all([
    prisma.$queryRaw<{ d: string; n: number }[]>`SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS d, count(*)::int AS n FROM "Feedback" WHERE "projectId" IN (${inIds}) AND kind <> 'question' AND "createdAt" >= ${since} GROUP BY 1`,
    prisma.$queryRaw<{ d: string; n: number }[]>`SELECT to_char(date_trunc('day', "liveAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS d, count(*)::int AS n FROM "Feedback" WHERE "projectId" IN (${inIds}) AND kind <> 'question' AND status = 'done' AND "liveAt" >= ${since} GROUP BY 1`,
    prisma.feedback.groupBy({ by: ["status"], where: { projectId: { in: ids }, ...notQ }, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ["kind"], where: { projectId: { in: ids }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, ...notQ, status: { in: [...OPEN_STATUSES] } }, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, kind: "bug", status: { in: [...OPEN_STATUSES] } }, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, ...notQ, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.feedback.groupBy({ by: ["projectId"], where: { projectId: { in: ids } }, _max: { createdAt: true } }),
    prisma.feedback.count({ where: { projectId: { in: ids }, ...notQ, createdAt: { gte: prevSince, lt: since } } }),
    prisma.$queryRaw<{ avg: number | null }[]>`SELECT avg(extract(epoch FROM ("liveAt" - "createdAt")))::float AS avg FROM "Feedback" WHERE "projectId" IN (${inIds}) AND kind <> 'question' AND status = 'done' AND "liveAt" >= ${since} AND "liveAt" IS NOT NULL`,
    prisma.feedback.findMany({
      where: { projectId: { in: ids }, ...notQ, status: { in: ["pending", "reviewing"] } },
      orderBy: { createdAt: "asc" },
      take: 6,
      select: { id: true, title: true, status: true, kind: true, createdAt: true, approvedAt: true, project: { select: { slug: true, name: true } } },
    }),
    prisma.feedback.findMany({
      where: { projectId: { in: ids }, ...notQ },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, status: true, kind: true, reporterName: true, createdAt: true, project: { select: { slug: true, name: true } } },
    }),
  ]);

  const created = new Map(createdRows.map((r) => [r.d, r.n]));
  const done = new Map(doneRows.map((r) => [r.d, r.n]));
  const series = labels.map((d) => ({ date: d, created: created.get(d) ?? 0, done: done.get(d) ?? 0 }));
  const byStatus = Object.fromEntries(statusG.map((g) => [g.status, g._count._all]));
  const count = (m: { projectId: string; _count: { _all: number } }[]) => new Map(m.map((x) => [x.projectId, x._count._all]));
  const openM = count(openByProject), bugM = count(bugsByProject), newM = count(newByProject);
  const lastM = new Map(lastByProject.map((x) => [x.projectId, x._max.createdAt]));

  const gated = projects.filter((p) => projectFeatures(p).requireApproval).map((p) => p.id);
  const awaitingApproval = gated.length
    ? await prisma.feedback.count({ where: { projectId: { in: gated }, ...notQ, approvedAt: null, status: { in: ["pending", "reviewing"] } } })
    : 0;

  return json({
    days,
    kpi: {
      open: OPEN_STATUSES.reduce((n, s) => n + (byStatus[s] ?? 0), 0),
      awaiting: byStatus["awaiting_user"] ?? 0,
      bugsOpen: [...bugM.values()].reduce((x, y) => x + y, 0),
      created: series.reduce((n, s) => n + s.created, 0),
      createdPrev,
      done: series.reduce((n, s) => n + s.done, 0),
      avgResolveSeconds: resolve[0]?.avg ?? null,
      awaitingApproval,
      approvalEnabled: gated.length > 0,
    },
    series,
    byStatus,
    byKind: Object.fromEntries(kindG.map((g) => [g.kind, g._count._all])),
    byProject: projects
      .map((p) => ({ slug: p.slug, name: p.name, open: openM.get(p.id) ?? 0, bugs: bugM.get(p.id) ?? 0, created: newM.get(p.id) ?? 0, last: lastM.get(p.id)?.toISOString() ?? null }))
      .sort((x, y) => y.open - x.open || x.name.localeCompare(y.name)),
    attention,
    recent,
  });
}
