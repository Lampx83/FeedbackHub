"use client";

import { useState } from "react";
import { api } from "../api";
import { Alert, Button, Card, Field, Input, Select, Spinner, TagsInput } from "../ui/primitives";
import { SaveBar, useSaveBar } from "./SaveBar";
import type { ProjectData, Save } from "./types";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Thông báo ra ngoài khi có góp ý mới: email và/hoặc webhook (Slack, Discord, Teams, Mattermost, n8n…). Chuông trong bảng điều khiển luôn có. */
export function NotifyTab({ project, save, mailConfigured }: { project: ProjectData; save: Save; mailConfigured: boolean }) {
  const [on, setOn] = useState(project.notify.on);
  const [emails, setEmails] = useState(project.notify.emails);
  const [hook, setHook] = useState(project.notify.webhookUrl ?? "");
  const bar = useSaveBar(save);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ email: string; webhook: string } | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const dirty = on !== project.notify.on || !same(emails, project.notify.emails) || hook.trim() !== (project.notify.webhookUrl ?? "");
  const hookErr = hook.trim() && !/^https:\/\/\S+$/.test(hook.trim()) ? "Cần địa chỉ bắt đầu bằng https://" : null;

  async function test() {
    setTesting(true);
    setResult(null);
    setTestErr(null);
    const r = await api<{ result: { email: string; webhook: string } }>(`/api/admin/projects/${project.slug}/notify-test`, { method: "POST", body: {} });
    setTesting(false);
    if (r.ok) setResult(r.data.result);
    else setTestErr(r.error);
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-base font-semibold">Chuông trong bảng điều khiển</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Luôn bật: mọi người được gán vào dự án thấy góp ý mới và trả lời của người gửi ở biểu tượng chuông (góc trên thanh bên), kèm số chưa đọc, tiêu đề tab “(3) …” và — nếu bật — thông báo trên màn hình khi hub đang mở. Bên dưới là kênh <strong>gửi ra ngoài</strong> để nhận cả khi không mở hub.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Gửi ra ngoài</h2>
        <div className="mt-4 space-y-5">
          <Field label="Khi nào gửi" hint="Câu hỏi thuần và góp ý do máy tự lập không gây thông báo.">
            <Select value={on} onChange={(e) => setOn(e.target.value as typeof on)}>
              <option value="all">Mọi góp ý mới và mọi trả lời của người gửi</option>
              <option value="bugs">Chỉ báo lỗi (loại “Lỗi”)</option>
              <option value="off">Tắt (chỉ dùng chuông)</option>
            </Select>
          </Field>
          <Field label="Email nhận thông báo" hint="Tối đa 10 địa chỉ. Email chỉ có tiêu đề, người gửi và đường dẫn về hub (văn bản thuần).">
            <TagsInput value={emails} onChange={setEmails} validate={(v) => (EMAIL.test(v) ? null : "Email không hợp lệ")} placeholder="ten@congty.com  (Enter để thêm)" />
          </Field>
          {emails.length && !mailConfigured ? (
            <Alert tone="warn">Máy chủ hub chưa cấu hình gửi email. Người quản trị hub cần đặt biến môi trường <code className="font-mono">HUB_SMTP_URL</code> (vd. <code className="font-mono">smtps://user:pass@smtp.example.com:465</code>) và <code className="font-mono">HUB_MAIL_FROM</code> rồi khởi động lại. Webhook bên dưới dùng được ngay.</Alert>
          ) : null}
          <Field
            label="Webhook chat (Slack, Discord, Teams, Mattermost, n8n…)"
            hint={<>Dán địa chỉ “Incoming Webhook” https://… Hub gửi JSON có <code className="font-mono">text</code> (Slack, Teams, Mattermost), <code className="font-mono">content</code> (Discord) và các trường có cấu trúc cho tự động hoá. Không gọi được địa chỉ nội bộ.</>}
            error={hookErr}
          >
            <Input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://hooks.slack.com/services/…" inputMode="url" />
          </Field>
        </div>
        <SaveBar
          dirty={dirty}
          busy={bar.busy}
          error={bar.error}
          saved={bar.saved}
          disabledReason={hookErr}
          onSave={() => void bar.run({ notify: { on, emails, webhookUrl: hook.trim() || null } })}
          onReset={() => { setOn(project.notify.on); setEmails(project.notify.emails); setHook(project.notify.webhookUrl ?? ""); }}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button variant="secondary" onClick={() => void test()} disabled={testing || dirty || (!project.notify.emails.length && !project.notify.webhookUrl)}>
            {testing ? <Spinner /> : null}
            Gửi thử
          </Button>
          <span className="text-[13px] text-muted">{dirty ? "Lưu thay đổi trước rồi mới gửi thử." : "Gửi một thông báo mẫu theo cấu hình đã lưu."}</span>
        </div>
        {testErr ? <Alert tone="error" className="mt-3">{testErr}</Alert> : null}
        {result ? (
          <Alert tone={result.email.startsWith("lỗi") || result.webhook.startsWith("lỗi") ? "warn" : "ok"} className="mt-3">
            Email: {result.email}. Webhook: {result.webhook}.
          </Alert>
        ) : null}
      </Card>
    </div>
  );
}
