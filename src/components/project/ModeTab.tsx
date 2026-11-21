"use client";

import { useState } from "react";
import { Card } from "../ui/primitives";
import { SaveBar, useSaveBar } from "./SaveBar";
import type { ProjectData, Save } from "./types";

function Option({ name, value, current, onSelect, title, tag, children }: { name: string; value: string; current: string; onSelect: (v: string) => void; title: string; tag: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-xl border border-line bg-surface p-4 transition hover:bg-surface-2/60 has-[:checked]:border-brand has-[:checked]:bg-brand/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40">
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onSelect(value)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]" />
      <span className="min-w-0 text-sm">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-base font-semibold">{title}</span>
          <span className="font-mono text-xs text-muted">{tag}</span>
        </span>
        <span className="mt-1 block leading-relaxed text-muted">{children}</span>
      </span>
    </label>
  );
}

export function ModeTab({ project, save }: { project: ProjectData; save: Save }) {
  const [mode, setMode] = useState(project.mode);
  const [deliver, setDeliver] = useState(project.deliver);
  const bar = useSaveBar(save);
  const dirty = mode !== project.mode || deliver !== project.deliver;

  return (
    <Card className="p-5">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Hub xử lý góp ý của dự án này thế nào?</legend>
        <div className="grid gap-3 lg:grid-cols-2">
          <Option name="mode" value="execute" current={mode} onSelect={setMode} title="Làm ngay" tag="execute">
            Worker (AI hoặc người) tự nhận góp ý từ hàng đợi, sửa mã và giao kết quả theo cách chọn bên dưới. Cần có worker chạy với khoá worker của dự án.
          </Option>
          <Option name="mode" value="collect" current={mode} onSelect={setMode} title="Chỉ thu nhận" tag="collect">
            Hub chỉ gom và quản lý góp ý, không tự sửa gì. Người phụ trách xem ở bảng Góp ý và xử lý thủ công, hoặc nhờ Claude qua khoá operator.
          </Option>
        </div>
      </fieldset>

      {mode === "execute" ? (
        <fieldset className="mt-6">
          <legend className="mb-3 text-sm font-semibold">Khi làm xong, giao kết quả ra sao?</legend>
          <div className="grid gap-3 lg:grid-cols-2">
            <Option name="deliver" value="branch" current={deliver} onSelect={setDeliver} title="Mở nhánh chờ duyệt" tag="branch">
              Worker đẩy thay đổi lên một nhánh riêng; người phụ trách xem lại rồi mới gộp. An toàn hơn, chậm hơn.
            </Option>
            <Option name="deliver" value="deploy" current={deliver} onSelect={setDeliver} title="Tự triển khai" tag="deploy">
              Thay đổi đã qua bước kiểm chứng được đưa lên chạy thật ngay, không chờ duyệt. Chỉ nên chọn khi đã tin quy trình kiểm chứng.
            </Option>
          </div>
        </fieldset>
      ) : null}

      <SaveBar
        dirty={dirty}
        busy={bar.busy}
        error={bar.error}
        saved={bar.saved}
        onSave={() => void bar.run({ mode, deliver })}
        onReset={() => {
          setMode(project.mode);
          setDeliver(project.deliver);
        }}
      />
    </Card>
  );
}
