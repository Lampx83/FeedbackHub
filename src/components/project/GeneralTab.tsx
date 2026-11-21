"use client";

import { useState } from "react";
import { isHttpOrigin } from "../labels";
import { Card, Field, Input, Switch, TagsInput } from "../ui/primitives";
import { SaveBar, useSaveBar } from "./SaveBar";
import type { ProjectData, Save } from "./types";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function GeneralTab({ project, save }: { project: ProjectData; save: Save }) {
  const [name, setName] = useState(project.name);
  const [origins, setOrigins] = useState(project.allowedOrigins);
  const [submitRoles, setSubmitRoles] = useState(project.submitRoles);
  const [adminRoles, setAdminRoles] = useState(project.adminRoles);
  const [anon, setAnon] = useState(project.anonymousSubmit);
  const [webhook, setWebhook] = useState(project.webhookUrl ?? "");
  const bar = useSaveBar(save);

  const dirty = name !== project.name || !same(origins, project.allowedOrigins) || !same(submitRoles, project.submitRoles) || !same(adminRoles, project.adminRoles) || anon !== project.anonymousSubmit || webhook.trim() !== (project.webhookUrl ?? "");
  const webhookErr = webhook.trim() ? (isHttpOrigin(webhook.trim()) ?? (webhook.trim() === "*" ? "Không phải địa chỉ hợp lệ" : null)) : null;
  const reason = name.trim().length < 2 ? "Tên dự án cần ít nhất 2 ký tự." : webhookErr;

  return (
    <Card className="p-5">
      <div className="space-y-5">
        <Field label="Tên dự án">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
        <Field label="Tên miền được phép" hint="Các địa chỉ gốc của ứng dụng được gọi hub từ trình duyệt, ví dụ https://app.example.com. Để trống nghĩa là chỉ gọi từ máy chủ ứng dụng (không có CORS). Dấu * cho mọi nguồn — không nên dùng.">
          <TagsInput value={origins} onChange={setOrigins} validate={isHttpOrigin} placeholder="https://…  (Enter để thêm)" />
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Vai trò được gửi góp ý" hint="Để trống = mọi người có token hợp lệ đều gửi được.">
            <TagsInput value={submitRoles} onChange={setSubmitRoles} placeholder="vd. STAFF  (Enter để thêm)" />
          </Field>
          <Field label="Vai trò quản trị" hint="Xem và xử lý mọi góp ý của dự án ngay trong ứng dụng; vai trò khác chỉ thấy góp ý của chính mình.">
            <TagsInput value={adminRoles} onChange={setAdminRoles} placeholder="vd. ADMIN  (Enter để thêm)" />
          </Field>
        </div>
        <div className="rounded-lg border border-line px-4">
          <Switch checked={anon} onChange={setAnon} label="Cho phép gửi ẩn danh" description="Người chưa đăng nhập vẫn gửi được (không cần token). Hub chỉ chặn bằng tên miền được phép và giới hạn tần suất, nên chỉ bật khi thật sự cần." />
        </div>
        <Field label="Địa chỉ webhook" error={webhookErr} hint="Khi có phản hồi hoặc đổi trạng thái, hub gửi POST tới địa chỉ này, ký HMAC-SHA256 bằng khoá của dự án (header X-Hub-Signature). Để trống nếu không dùng.">
          <Input type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://ung-dung.example.com/hooks/feedback" />
        </Field>
      </div>
      <SaveBar
        dirty={dirty}
        busy={bar.busy}
        error={bar.error}
        saved={bar.saved}
        disabledReason={reason}
        onSave={() => void bar.run({ name: name.trim(), allowedOrigins: origins, submitRoles, adminRoles, anonymousSubmit: anon, webhookUrl: webhook.trim() || null })}
        onReset={() => {
          setName(project.name);
          setOrigins(project.allowedOrigins);
          setSubmitRoles(project.submitRoles);
          setAdminRoles(project.adminRoles);
          setAnon(project.anonymousSubmit);
          setWebhook(project.webhookUrl ?? "");
        }}
      />
    </Card>
  );
}
