"use client";

import { useState } from "react";
import { api } from "./api";
import { Modal } from "./ui/Modal";
import { Alert, Button, Field, Input, Select, Textarea } from "./ui/primitives";
import { KINDS, KIND_LABEL, PRIORITIES, PRIORITY_LABEL } from "@/lib/status";

type Created = { feedback: { id: string } };

/** Form tạo yêu cầu chỉnh sửa cho người điều phối (BA): có mẫu Bối cảnh / Hành vi mong muốn / Tiêu chí chấp nhận. */
export function NewRequestDialog({
  open,
  projects,
  defaultProject,
  onClose,
  onCreated,
}: {
  open: boolean;
  projects: { slug: string; name: string }[];
  defaultProject: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [project, setProject] = useState(projects.some((p) => p.slug === defaultProject) ? defaultProject : (projects[0]?.slug ?? ""));
  const [kind, setKind] = useState("function");
  const [priority, setPriority] = useState("normal");
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [desired, setDesired] = useState("");
  const [criteria, setCriteria] = useState("");
  const [pagePath, setPagePath] = useState("");
  const [requirePlan, setRequirePlan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<Created>("/api/admin/feedback", {
      body: { project, kind, priority, title, context: context || undefined, desired, criteria, pagePath: pagePath.trim() || undefined, requirePlan: requirePlan || undefined },
    });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onCreated(r.data.feedback.id);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Tạo yêu cầu chỉnh sửa"
      description="Viết đủ để người (hoặc AI) xử lý hiểu cần làm gì và biết khi nào là xong. Yêu cầu vẫn phải được duyệt như mọi góp ý."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Huỷ</Button>
          <Button type="submit" form="new-request" disabled={busy || !project}>{busy ? "Đang tạo…" : "Tạo yêu cầu"}</Button>
        </>
      }
    >
      <form id="new-request" onSubmit={(e) => void submit(e)} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Dự án">
            <Select value={project} onChange={(e) => setProject(e.target.value)} required>
              {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Loại">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.filter((k) => k !== "question").map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </Select>
          </Field>
          <Field label="Mức ưu tiên">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Tiêu đề" hint="Một câu nói rõ cần đổi gì.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={4} maxLength={200} placeholder="vd. Cho phép xuất báo cáo tuần ra Excel" />
        </Field>
        <Field label="Bối cảnh (không bắt buộc)" hint="Vấn đề nghiệp vụ hiện tại, ai gặp, gặp khi nào.">
          <Textarea rows={3} value={context} onChange={(e) => setContext(e.target.value)} maxLength={10000} />
        </Field>
        <Field label="Hành vi mong muốn" hint="Sau khi sửa, hệ thống phải hoạt động thế nào.">
          <Textarea rows={4} value={desired} onChange={(e) => setDesired(e.target.value)} required minLength={10} maxLength={10000} />
        </Field>
        <Field label="Tiêu chí chấp nhận" hint="Làm sao biết đã xong? Nên là điều kiểm được (vd. «bấm Xuất → tải về file .xlsx có đủ cột A–F»).">
          <Textarea rows={3} value={criteria} onChange={(e) => setCriteria(e.target.value)} required minLength={5} maxLength={4000} />
        </Field>
        <Field label="Trang áp dụng (không bắt buộc)" hint="Đường dẫn trong ứng dụng, bắt đầu bằng «/». Bỏ trống nếu áp dụng cho cả hệ thống.">
          <Input value={pagePath} onChange={(e) => setPagePath(e.target.value)} maxLength={200} placeholder="/reports/weekly" />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" checked={requirePlan} onChange={(e) => setRequirePlan(e.target.checked)} />
          <span>Yêu cầu AI trình kế hoạch cho tôi duyệt trước khi sửa mã</span>
        </label>
      </form>
    </Modal>
  );
}
