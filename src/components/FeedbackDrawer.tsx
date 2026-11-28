"use client";

import { useEffect, useId, useRef, useState } from "react";
import { withBase } from "@/lib/base-path";
import { api } from "./api";
import { formatBytes, formatDateTime } from "./format";
import { useLoader } from "./useLoader";
import { ACTOR_LABEL, ROLE_LABEL, SOURCE_LABEL, VERDICT_LABEL, VERIFY_LABEL } from "./labels";
import { ConfirmDialog, useOverlay } from "./ui/Modal";
import { Alert, Badge, Button, KindBadge, Spinner, StatusBadge, Textarea } from "./ui/primitives";
import { HUMAN_SETTABLE, PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status } from "@/lib/status";

type Message = { id: string; role: string; authorName: string | null; body: string; kind: string; createdAt: string };
type FbEvent = { id: string; kind: string; fromStatus: string | null; toStatus: string | null; actor: string; detail: unknown; createdAt: string };
type Attachment = { id: string; fileName: string; mimeType: string; sizeBytes: number };
export type Detail = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  type: string | null;
  status: string;
  reporterName: string;
  reporterEmail: string | null;
  reporterRole: string | null;
  adminNote: string | null;
  pagePath: string | null;
  pageUrl: string | null;
  scope: string;
  pageTarget: string | null;
  suggestion: { before?: string; after?: string } | null;
  contentRef: string | null;
  extra: unknown;
  source: string;
  refDensity: number;
  clarifyRounds: number;
  agentRuns: number;
  costUsd: number;
  rolledBack: boolean;
  verifyResult: string | null;
  userVerdict: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  successCriteria: string | null;
  priority: string | null;
  planApproval: string | null;
  aiModel: string | null;
  claimedBy: string | null;
  createdAt: string;
  project: { slug: string; name: string; mode: string };
  messages: Message[];
  events: FbEvent[];
  attachments: Attachment[];
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-x-3 py-1 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/50 px-3 py-2">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** "đường dẫn CSS | đoạn chữ nhìn thấy" → tách ở dấu " | " đầu tiên. */
function splitTarget(t: string): { selector: string; text: string | null } {
  const i = t.indexOf(" | ");
  return i < 0 ? { selector: t, text: null } : { selector: t.slice(0, i), text: t.slice(i + 3) };
}

function eventText(e: FbEvent): string {
  if (e.kind === "created") return "Góp ý được tạo";
  if (e.kind === "status") {
    const f = e.fromStatus && e.fromStatus in STATUS_LABEL ? STATUS_LABEL[e.fromStatus as Status] : e.fromStatus;
    const t = e.toStatus && e.toStatus in STATUS_LABEL ? STATUS_LABEL[e.toStatus as Status] : e.toStatus;
    return `Đổi trạng thái: ${f ?? "—"} → ${t ?? "—"}`;
  }
  if (e.kind === "approval") {
    const d = e.detail as { approved?: boolean; by?: string } | null;
    return d?.approved ? `Đã duyệt${d.by ? ` bởi ${d.by}` : ""} — AI được phép xử lý` : "Bỏ duyệt";
  }
  if (e.kind === "webhook_fail") return "Gửi webhook cho ứng dụng thất bại";
  return e.kind;
}

export function FeedbackDrawer({ id, onClose, onChanged, onPrev, onNext }: { id: string; onClose: () => void; onChanged: () => void; onPrev?: () => void; onNext?: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(true, onClose, panel);

  const { data, error, reload: load } = useLoader<{ feedback: Detail; canManage?: boolean }>(`/api/admin/feedback/${id}`, 15000);
  const fb = data?.feedback ?? null;
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const timeline = useRef<HTMLDivElement>(null);

  async function setApproved(approved: boolean) {
    setBusy(true);
    setActionError(null);
    const r = await api(`/api/admin/feedback/${id}`, { method: "PATCH", body: { approved } });
    setBusy(false);
    if (!r.ok) return setActionError(r.error);
    await load();
    onChanged();
  }

  async function send(status: Status | null, message: string): Promise<string | void> {
    setBusy(true);
    setActionError(null);
    const r = await api(`/api/admin/feedback/${id}`, {
      method: "PATCH",
      body: { ...(status ? { status } : {}), ...(message.trim() ? { message: message.trim() } : {}) },
    });
    setBusy(false);
    if (!r.ok) {
      setActionError(r.error);
      return r.error;
    }
    setReply("");
    await load();
    onChanged();
  }

  function pickStatus(s: Status) {
    if (s === "rejected") return setRejecting(true);
    if (s === "awaiting_user" && !reply.trim()) {
      setActionError("Nhập câu hỏi cho người gửi trong ô trả lời trước khi chuyển sang “Chờ người gửi trả lời”.");
      return;
    }
    void send(s, reply);
  }

  const messages = fb?.messages ?? [];
  const lastMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    if (lastMessageId) timeline.current?.scrollIntoView({ block: "nearest" });
  }, [lastMessageId]);

  const target = fb?.pageTarget ? splitTarget(fb.pageTarget) : null;
  const hasSuggestion = fb?.suggestion && (fb.suggestion.before || fb.suggestion.after);
  const extraObj = fb?.extra && typeof fb.extra === "object" ? (fb.extra as Record<string, unknown>) : null;
  const extraJson = fb?.extra && typeof fb.extra === "object" && Object.keys(fb.extra as object).length ? JSON.stringify(fb.extra, null, 2) : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/45" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="flex h-dvh w-full flex-col border-l border-line bg-surface shadow-2xl outline-none sm:w-[36rem] lg:w-[42rem]">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-base font-semibold leading-snug">
              {fb?.title ?? "Chi tiết góp ý"}
            </h2>
            {fb ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={fb.status} />
                <KindBadge kind={fb.kind} />
                {fb.approvedAt ? <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300">Đã duyệt</Badge> : null}
                {fb.type ? <Badge className="bg-surface-2 text-muted ring-1 ring-inset ring-line">{fb.type}</Badge> : null}
              </div>
            ) : null}
          </div>
          <div className="-mr-1 flex shrink-0 items-center gap-0.5">
          {onPrev || onNext ? (
            <>
              <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Góp ý trước (k)" title="Góp ý trước (k)" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 15l6-6 6 6" /></svg>
              </button>
              <button type="button" onClick={onNext} disabled={!onNext} aria-label="Góp ý kế tiếp (j)" title="Góp ý kế tiếp (j)" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </>
          ) : null}
          <button type="button" onClick={onClose} aria-label="Đóng" className="shrink-0 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && !fb ? <div className="p-5"><Alert tone="error">{error}</Alert></div> : null}
          {!fb && !error ? <p className="p-8 text-center text-sm text-muted">Đang tải…</p> : null}
          {fb ? (
            <>
              <Section title="Nội dung">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{fb.body || <span className="text-muted">Không có mô tả chi tiết.</span>}</p>
                <dl className="mt-3">
                  <Row label="Dự án">{fb.project.name}</Row>
                  <Row label="Người gửi">
                    {fb.reporterName}
                    {fb.reporterRole ? <span className="text-muted"> · {fb.reporterRole}</span> : null}
                    {fb.reporterEmail ? <span className="block text-[13px] text-muted">{fb.reporterEmail}</span> : null}
                  </Row>
                  <Row label="Gửi lúc">{formatDateTime(fb.createdAt)}</Row>
                  <Row label="Nguồn">{SOURCE_LABEL[fb.source] ?? fb.source}</Row>
                </dl>
              </Section>

              <Section title="Ngữ cảnh">
                <dl>
                  <Row label="Phạm vi">{fb.scope === "system" ? "Toàn hệ thống" : "Một trang cụ thể"}</Row>
                  {fb.pagePath ? (
                    <Row label="Trang">
                      {fb.pageUrl && /^https?:\/\//i.test(fb.pageUrl) ? (
                        <a href={fb.pageUrl} target="_blank" rel="noreferrer noopener" className="text-brand underline-offset-2 hover:underline">
                          {fb.pagePath}
                        </a>
                      ) : (
                        fb.pagePath
                      )}
                    </Row>
                  ) : null}
                  {extraObj?.pageTitle ? <Row label="Tiêu đề trang">{String(extraObj.pageTitle)}</Row> : null}
                  {fb.pageUrl ? (
                    <Row label="Địa chỉ đầy đủ">
                      <code className="break-all font-mono text-xs text-muted">{fb.pageUrl}</code>
                    </Row>
                  ) : null}
                  {target ? (
                    <Row label="Phần tử đã chỉ">
                      {target.text ? <span className="block">“{target.text}”</span> : null}
                      <code className="block break-all font-mono text-xs text-muted">{target.selector}</code>
                    </Row>
                  ) : null}
                  {fb.contentRef ? (
                    <Row label="Đối tượng nội dung">
                      <code className="font-mono text-[13px]">{fb.contentRef}</code>
                    </Row>
                  ) : null}
                  {fb.priority ? <Row label="Mức ưu tiên">{PRIORITY_LABEL[fb.priority as Priority] ?? fb.priority}</Row> : null}
                  {fb.successCriteria ? <Row label="Tiêu chí hoàn thành">{fb.successCriteria}</Row> : null}
                </dl>
                {hasSuggestion ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                      <div className="mb-1 text-xs font-semibold text-red-700 dark:text-red-300">Chữ hiện tại</div>
                      <p className="whitespace-pre-wrap break-words text-sm">{fb.suggestion?.before || "—"}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                      <div className="mb-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">Sửa thành</div>
                      <p className="whitespace-pre-wrap break-words text-sm">{fb.suggestion?.after || "—"}</p>
                    </div>
                  </div>
                ) : null}
                {extraJson ? (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted">Dữ liệu riêng của ứng dụng</summary>
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">{extraJson}</pre>
                  </details>
                ) : null}
              </Section>

              <Section title={`Tệp đính kèm (${fb.attachments.length})`}>
                {fb.attachments.length === 0 ? (
                  <p className="text-sm text-muted">Không có tệp đính kèm.</p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap gap-3">
                      {fb.attachments.filter((a) => a.mimeType.startsWith("image/")).map((a) => (
                        <a key={a.id} href={withBase(`/api/admin/attachments/${a.id}`)} target="_blank" rel="noopener noreferrer" title={a.fileName}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={withBase(`/api/admin/attachments/${a.id}`)} alt={a.fileName} loading="lazy" className="max-h-44 max-w-full rounded-lg border border-line object-contain" />
                        </a>
                      ))}
                    </div>
                    <ul className="divide-y divide-line rounded-lg border border-line">
                      {fb.attachments.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <a href={withBase(`/api/admin/attachments/${a.id}`)} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-brand underline-offset-2 hover:underline">
                            {a.fileName}
                          </a>
                          <span className="shrink-0 text-xs text-muted">
                            {a.mimeType} · {formatBytes(a.sizeBytes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>

              <Section title="Chỉ số">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Mật độ quy chiếu" value={fb.refDensity} />
                  <Metric label="Số vòng hỏi lại" value={fb.clarifyRounds} />
                  <Metric label="Số lượt chạy AI" value={fb.agentRuns} />
                  <Metric label="Chi phí" value={`$${fb.costUsd.toFixed(2)}`} />
                  <Metric label="Kết quả kiểm chứng" value={fb.verifyResult ? (VERIFY_LABEL[fb.verifyResult] ?? fb.verifyResult) : "—"} />
                  <Metric label="Người gửi xác nhận" value={fb.userVerdict ? (VERDICT_LABEL[fb.userVerdict] ?? fb.userVerdict) : "—"} />
                </div>
                {fb.aiModel || fb.claimedBy || fb.rolledBack || fb.planApproval ? (
                  <p className="mt-2 text-[13px] text-muted">
                    {[fb.aiModel ? `Mô hình: ${fb.aiModel}` : null, fb.claimedBy ? `Đang giữ việc: ${fb.claimedBy}` : null, fb.planApproval ? `Kế hoạch: ${fb.planApproval === "approved" ? "đã duyệt" : "chờ duyệt"}` : null, fb.rolledBack ? "Đã hoàn tác thay đổi" : null].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </Section>

              <Section title={`Trao đổi (${messages.length})`}>
                {messages.length === 0 ? (
                  <p className="text-sm text-muted">Chưa có tin nhắn.</p>
                ) : (
                  <ol className="space-y-3">
                    {messages.map((m) => {
                      const muted = m.kind !== "chat";
                      return (
                        <li key={m.id} className={muted ? "opacity-75" : ""}>
                          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <span className={`font-semibold ${m.role === "admin" ? "text-brand" : m.role === "ai" ? "text-violet-700 dark:text-violet-300" : "text-fg"}`}>
                              {m.authorName || ROLE_LABEL[m.role] || m.role}
                            </span>
                            <span>{ROLE_LABEL[m.role] ?? m.role}</span>
                            {m.kind === "progress" ? <Badge className="bg-surface-2 text-muted">Tiến độ</Badge> : null}
                            {m.kind === "system" ? <Badge className="bg-surface-2 text-muted">Hệ thống</Badge> : null}
                            <span>{formatDateTime(m.createdAt)}</span>
                          </div>
                          <p className={`mt-1 whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "bg-surface-2" : "bg-brand/10"}`}>{m.body}</p>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <div ref={timeline} />
              </Section>

              <Section title="Sự kiện">
                <ol className="space-y-1.5 border-l border-line pl-4">
                  {fb.events.map((e) => (
                    <li key={e.id} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-line" aria-hidden />
                      <span>{eventText(e)}</span>
                      <span className="block text-xs text-muted">
                        {ACTOR_LABEL[e.actor] ?? e.actor} · {formatDateTime(e.createdAt)}
                      </span>
                      {e.detail && typeof e.detail === "object" ? <code className="block break-all font-mono text-[11px] text-muted">{JSON.stringify(e.detail)}</code> : null}
                    </li>
                  ))}
                </ol>
              </Section>
            </>
          ) : null}
        </div>

        {fb && data?.canManage === false ? (
          <div className="border-t border-line bg-surface px-5 py-3 text-[13px] text-muted">Bạn chỉ có quyền xem dự án này — không trả lời hay đổi trạng thái được.</div>
        ) : fb ? (
          <div className="space-y-2.5 border-t border-line bg-surface px-5 py-3">
            {actionError ? <Alert tone="error">{actionError}</Alert> : null}
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Trả lời người gửi (hiện trong luồng trao đổi và gửi webhook cho ứng dụng)…" rows={2} aria-label="Trả lời người gửi" className="min-h-16 resize-y" />
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2">
              <span className="min-w-0 flex-1 basis-56 text-[13px] leading-snug text-muted">
                {fb.approvedAt ? <>Đã duyệt{fb.approvedBy ? ` bởi ${fb.approvedBy}` : ""} ({formatDateTime(fb.approvedAt)}): AI của dự án được phép đọc và xử lý góp ý này.</> : "Chưa duyệt. Nếu dự án bật “cần duyệt”, AI chưa thấy góp ý này — hãy đọc kỹ rồi duyệt."}
              </span>
              <Button size="sm" variant={fb.approvedAt ? "secondary" : "primary"} disabled={busy} onClick={() => void setApproved(!fb.approvedAt)}>
                {fb.approvedAt ? "Bỏ duyệt" : "Duyệt để AI xử lý"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" onClick={() => void send(null, reply)} disabled={busy || !reply.trim()}>
                {busy ? <Spinner /> : null}
                Gửi trả lời
              </Button>
              <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
              <span className="text-[13px] text-muted">Đổi trạng thái:</span>
              {HUMAN_SETTABLE.map((s) => (
                <Button key={s} size="sm" variant={fb.status === s ? "primary" : "secondary"} disabled={busy || fb.status === s} onClick={() => pickStatus(s)}>
                  {STATUS_LABEL[s]}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={rejecting}
        danger
        title="Không thực hiện góp ý này?"
        message="Góp ý chuyển sang “Không thực hiện” và người gửi nhận được lý do bên dưới."
        inputLabel="Lý do (gửi cho người gửi)"
        inputRequired
        inputInitial={reply}
        confirmLabel="Không thực hiện"
        onCancel={() => setRejecting(false)}
        onConfirm={async (reason) => {
          const err = await send("rejected", reason);
          if (typeof err === "string") return err;
          setRejecting(false);
        }}
      />
    </div>
  );
}
