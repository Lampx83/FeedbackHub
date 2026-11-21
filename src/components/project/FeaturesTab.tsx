"use client";

import { useState } from "react";
import { AddButton, ConfirmDialog, Modal } from "../ui/Modal";
import { Alert, Button, Card, EmptyState, Field, Input, Spinner, Switch, Toolbar } from "../ui/primitives";
import { SaveBar, useSaveBar } from "./SaveBar";
import type { ProjectData, Save } from "./types";

const FLAGS = [
  { key: "scopePicker", label: "Chọn phạm vi", description: "Người gửi chọn góp ý áp dụng cho trang đang xem hay cho toàn hệ thống." },
  { key: "elementPicker", label: "Chỉ vào phần tử", description: "Người gửi bấm chọn đúng chỗ trên trang cần sửa; hub ghi lại vị trí và đoạn chữ đó." },
  { key: "voice", label: "Nhập bằng giọng nói", description: "Cho đọc nội dung góp ý thay vì gõ." },
  { key: "attachments", label: "Đính kèm tệp", description: "Cho đính kèm ảnh chụp màn hình hoặc tài liệu vào góp ý." },
  { key: "planApproval", label: "Duyệt kế hoạch trước khi làm", description: "Worker trình kế hoạch, được duyệt rồi mới sửa mã. Chỉ có nghĩa ở chế độ “Làm ngay”." },
  { key: "successCriteria", label: "Tiêu chí hoàn thành", description: "Cho người gửi mô tả thế nào là xong để hub kiểm chứng sau khi làm." },
] as const;
type FlagKey = (typeof FLAGS)[number]["key"];

export function FeaturesTab({ project, save }: { project: ProjectData; save: Save }) {
  const [flags, setFlags] = useState<Record<FlagKey, boolean>>(() => Object.fromEntries(FLAGS.map((f) => [f.key, project.features[f.key]])) as Record<FlagKey, boolean>);
  const bar = useSaveBar(save);
  const dirty = FLAGS.some((f) => flags[f.key] !== project.features[f.key]);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-base font-semibold">Tính năng của nút nổi</h2>
        <p className="mt-1 text-sm text-muted">Bật hoặc tắt từng tính năng người gửi thấy trong nút nổi và ngăn kéo góp ý.</p>
        <div className="mt-2 divide-y divide-line">
          {FLAGS.map((f) => (
            <Switch key={f.key} checked={flags[f.key]} onChange={(v) => setFlags((s) => ({ ...s, [f.key]: v }))} label={f.label} description={f.description} />
          ))}
        </div>
        <SaveBar dirty={dirty} busy={bar.busy} error={bar.error} saved={bar.saved} onSave={() => void bar.run({ features: flags })} onReset={() => setFlags(Object.fromEntries(FLAGS.map((f) => [f.key, project.features[f.key]])) as Record<FlagKey, boolean>)} />
      </Card>
      <ScreenshotSection project={project} save={save} />
      <ModelsSection project={project} save={save} />
    </div>
  );
}

const SHOT_OPTIONS = [
  { value: "default", label: "Bật sẵn", description: "Ô “đính kèm ảnh chụp trang” được chọn sẵn; người gửi bỏ chọn được. Hợp với góp ý về nội dung và dữ liệu — người xử lý thấy đúng cái người gửi thấy." },
  { value: "optional", label: "Cho chọn", description: "Có ô đính kèm ảnh chụp trang nhưng mặc định không chọn." },
  { value: "off", label: "Tắt", description: "Không chụp trang. Vẫn lưu đường dẫn, tiêu đề trang và ngữ cảnh do ứng dụng gửi." },
] as const;

function ScreenshotSection({ project, save }: { project: ProjectData; save: Save }) {
  const [mode, setMode] = useState<(typeof SHOT_OPTIONS)[number]["value"]>(project.features.screenshot ?? "optional");
  const bar = useSaveBar(save);
  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Ảnh chụp trang kèm góp ý</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Khi gửi, widget chụp lại trang người dùng đang xem và đính kèm vào góp ý (tệp <code className="font-mono text-[13px]">trang-chup.png</code>). Ảnh chỉ người quản trị dự án xem được; ô mật khẩu luôn bị che, và ứng dụng có thể che thêm vùng nhạy cảm bằng thuộc tính <code className="font-mono text-[13px]">data-feedbackhub-mask</code>.
      </p>
      <div className="mt-3 space-y-2">
        {SHOT_OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-brand">
            <input type="radio" name="shot" className="mt-1" checked={mode === o.value} onChange={() => setMode(o.value)} />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-sm text-muted">{o.description}</span>
            </span>
          </label>
        ))}
      </div>
      <SaveBar dirty={mode !== (project.features.screenshot ?? "optional")} busy={bar.busy} error={bar.error} saved={bar.saved} onSave={() => void bar.run({ features: { screenshot: mode } })} onReset={() => setMode(project.features.screenshot ?? "optional")} />
    </Card>
  );
}

function ModelsSection({ project, save }: { project: ProjectData; save: Save }) {
  const models = project.features.models ?? [];
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  return (
    <section>
      <h2 className="text-base font-semibold">Mô hình AI cho người gửi chọn</h2>
      <p className="mb-3 mt-1 text-sm leading-relaxed text-muted">
        Danh sách mô hình hiện ở nút nổi để người gửi chọn cho từng góp ý. Chỉ có nghĩa ở chế độ “Làm ngay”{project.mode === "collect" ? " — dự án này đang ở chế độ “Chỉ thu nhận” nên chưa dùng tới" : ""}. Để trống thì không có ô chọn.
      </p>
      <Toolbar right={<AddButton onClick={() => setAdding(true)}>Thêm mô hình</AddButton>} />
      {models.length === 0 ? (
        <EmptyState title="Chưa có mô hình nào" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {models.map((m, i) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate font-medium">{m.label}</div>
                  <div className="font-mono text-xs text-muted">{m.id}</div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setRemoving(i)}>
                  Xoá
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {adding ? (
        <ModelForm
          taken={models.map((m) => m.id)}
          atLimit={models.length >= 10}
          onClose={() => setAdding(false)}
          onSubmit={async (m) => {
            const r = await save({ features: { models: [...models, m] } });
            if (!r.ok) return r.error;
            setAdding(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        danger
        title="Xoá mô hình khỏi danh sách"
        message={<>Người gửi sẽ không còn chọn được <strong>{removing !== null ? models[removing]?.label : ""}</strong>.</>}
        confirmLabel="Xoá"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const r = await save({ features: { models: models.filter((_, i) => i !== removing) } });
          if (!r.ok) return r.error;
          setRemoving(null);
        }}
      />
    </section>
  );
}

function ModelForm({ taken, atLimit, onClose, onSubmit }: { taken: string[]; atLimit: boolean; onClose: () => void; onSubmit: (m: { id: string; label: string }) => Promise<string | void> }) {
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dup = taken.includes(id.trim());
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await onSubmit({ id: id.trim(), label: label.trim() });
    setBusy(false);
    if (typeof err === "string") setError(err);
  }
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Thêm mô hình"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" form="model-form" disabled={busy || atLimit || dup || !id.trim() || !label.trim()}>
            {busy ? <Spinner /> : null}
            Thêm
          </Button>
        </>
      }
    >
      <form id="model-form" onSubmit={submit} className="space-y-4">
        {atLimit ? <Alert tone="warn">Tối đa 10 mô hình.</Alert> : null}
        <Field label="Nhãn hiển thị" hint="Tên người gửi thấy, ví dụ “Nhanh và rẻ”.">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Mã mô hình" error={dup ? "Mã này đã có." : null} hint="Mã worker dùng để chọn mô hình, ví dụ claude-sonnet-4-5.">
          <Input value={id} onChange={(e) => setId(e.target.value)} className="font-mono" maxLength={60} />
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}
