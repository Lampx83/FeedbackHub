"use client";

import { useState } from "react";
import { DEFAULT_WORKER } from "@/lib/project-config";
import { Card, Field, Input, Textarea } from "../ui/primitives";
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
  // Cấu hình AI-dev (chỉ thắt chặt so với trần cục bộ của máy chạy worker).
  const w0 = { ...DEFAULT_WORKER, ...(project.features.worker ?? {}) };
  const [budget, setBudget] = useState(w0.budgetUsd === null ? "" : String(w0.budgetUsd));
  const [minutes, setMinutes] = useState(w0.timeoutSec === null ? "" : String(Math.round(w0.timeoutSec / 60)));
  const [instructions, setInstructions] = useState(w0.instructions);
  const [boundaries, setBoundaries] = useState(w0.boundaries.join("\n"));
  const worker = {
    budgetUsd: budget.trim() === "" ? null : Number(budget),
    timeoutSec: minutes.trim() === "" ? null : Math.round(Number(minutes) * 60),
    instructions: instructions.trim(),
    boundaries: boundaries.split("\n").map((l) => l.trim()).filter(Boolean),
  };
  const workerDirty = JSON.stringify(worker) !== JSON.stringify({ ...w0, instructions: w0.instructions.trim() });
  const dirty = mode !== project.mode || deliver !== project.deliver || workerDirty;

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

      {mode === "execute" ? (
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">Cấu hình AI làm việc (để trống = theo trần của máy chạy worker)</legend>
          <p className="mb-3 mt-1 text-[13px] leading-snug text-muted">
            Chỉ thắt chặt được: ngân sách và thời gian lấy giá trị <b>nhỏ hơn</b> giữa ô này và trần trên máy chạy worker, ranh giới thì <b>cộng thêm</b> vào ranh giới sẵn có. Đường dẫn được sửa, lệnh dựng/triển khai và khoá luôn do máy đó quyết, không đổi được từ đây.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ngân sách tối đa mỗi lượt (USD)" hint="0,1 – 100. Mỗi yêu cầu là một lượt.">
              <Input type="number" inputMode="decimal" min={0.1} max={100} step={0.1} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="vd. 3" />
            </Field>
            <Field label="Thời gian tối đa mỗi lượt (phút)" hint="1 – 240.">
              <Input type="number" inputMode="numeric" min={1} max={240} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="vd. 30" />
            </Field>
          </div>
          <div className="mt-3 space-y-3">
            <Field label="Hướng dẫn riêng cho AI của dự án này" hint="Quy ước, cách chạy kiểm thử, điều cần tránh… (văn bản thuần, tối đa 4000 ký tự). Không thay được quy tắc an toàn của worker.">
              <Textarea rows={4} maxLength={4000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </Field>
            <Field label="Ranh giới bổ sung (mỗi dòng một điều)" hint="Vd. «Không đụng công thức tính điểm». Tối đa 20 dòng, mỗi dòng 500 ký tự.">
              <Textarea rows={3} value={boundaries} onChange={(e) => setBoundaries(e.target.value)} />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <SaveBar
        dirty={dirty}
        busy={bar.busy}
        error={bar.error}
        saved={bar.saved}
        onSave={() => void bar.run({ mode, deliver, ...(workerDirty ? { features: { worker } } : {}) })}
        onReset={() => {
          setMode(project.mode);
          setDeliver(project.deliver);
          setBudget(w0.budgetUsd === null ? "" : String(w0.budgetUsd));
          setMinutes(w0.timeoutSec === null ? "" : String(Math.round(w0.timeoutSec / 60)));
          setInstructions(w0.instructions);
          setBoundaries(w0.boundaries.join("\n"));
        }}
      />
    </Card>
  );
}
