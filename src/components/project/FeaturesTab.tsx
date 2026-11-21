"use client";

import { useState } from "react";
import { AddButton, ConfirmDialog, Modal } from "../ui/Modal";
import { Alert, Button, Card, EmptyState, Field, Input, Spinner, Switch, TagsInput, Textarea, Toolbar } from "../ui/primitives";
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
      <EntryPointsSection project={project} save={save} />
      <ScreenshotSection project={project} save={save} />
      <ModelsSection project={project} save={save} />
    </div>
  );
}

const linesOf = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/** Lối vào hộp góp ý ngoài nút nổi — đều cấu hình ở đây, ứng dụng chủ không phải viết thêm mã. */
function EntryPointsSection({ project, save }: { project: ProjectData; save: Save }) {
  const init = () => ({
    textSelection: project.features.textSelection ?? false,
    selectionScope: project.features.selectionScope ?? "",
    selectionRoles: project.features.selectionRoles ?? [],
    hidePaths: (project.features.hidePaths ?? []).join("\n"),
  });
  const [v, setV] = useState(init);
  const bar = useSaveBar(save);
  const cur = init();
  const dirty = v.textSelection !== cur.textSelection || v.selectionScope.trim() !== cur.selectionScope || v.selectionRoles.join("\n") !== cur.selectionRoles.join("\n") || linesOf(v.hidePaths).join("\n") !== cur.hidePaths;
  const badPath = linesOf(v.hidePaths).find((p) => !p.startsWith("/") || /\s/.test(p));
  const code = (s: string) => <code className="font-mono text-[13px]">{s}</code>;

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold">Lối vào hộp góp ý</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Ngoài nút nổi, người dùng còn mở được hộp góp ý từ một nút đặt sẵn trong trang (ví dụ cạnh chuông thông báo ở header): ứng dụng chỉ cần thêm {code("<span data-feedbackhub-launcher hidden></span>")} vào đúng chỗ, widget tự vẽ nút cùng màu chữ của chỗ đó và chỉ hiện khi người dùng gửi được góp ý. Muốn có chữ cạnh biểu tượng thì đặt giá trị {code('"label"')}. Tắt nút nổi bằng {code('data-fab="false"')}.
      </p>
      <div className="mt-2 divide-y divide-line">
        <Switch
          checked={v.textSelection}
          onChange={(x) => setV((s) => ({ ...s, textSelection: x }))}
          label="Góp ý khi bôi đen chữ"
          description="Người dùng bôi đen một đoạn chữ thì hiện bong bóng “Góp ý đoạn này” ngay dưới đoạn đó; bấm vào là mở hộp góp ý với đoạn chữ điền sẵn (loại “nội dung” nếu dự án có, kèm vị trí trên trang). Hợp nhất để báo sai nội dung."
        />
      </div>
      <div className="mt-4 space-y-4">
        <Field label="Chỉ hiện bong bóng trong vùng (bộ chọn CSS, tuỳ chọn)" hint={<>Ví dụ {code("#lesson-content, article")}. Để trống = cả trang. Ô nhập liệu không bao giờ hiện bong bóng.</>}>
          <Input value={v.selectionScope} disabled={!v.textSelection} maxLength={200} placeholder="#lesson-content" onChange={(e) => setV((s) => ({ ...s, selectionScope: e.target.value }))} />
        </Field>
        <Field label="Ai được góp ý khi bôi đen (vai trò, tuỳ chọn)" hint={<>Giá trị {code("role")} trong token của người dùng, ví dụ {code("INSTRUCTOR")}. Để trống = mọi người gửi được góp ý đều thấy bong bóng. Nút góp ý chung (nút nổi, nút trên header) luôn hiện cho mọi người, không phụ thuộc ô này.</>}>
          <TagsInput value={v.selectionRoles} onChange={(r) => setV((s) => ({ ...s, selectionRoles: r }))} placeholder="vd. INSTRUCTOR  (Enter để thêm)" />
        </Field>
        <Field
          label="Trang không hiện lối vào nào"
          hint={<>Mỗi dòng một tiền tố đường dẫn, ví dụ {code("/thi")} ẩn cả {code("/thi/abc")}. Áp dụng cho nút nổi, nút đặt trong trang và bong bóng bôi đen — dùng cho trang làm bài thi, trang trình chiếu.</>}
          error={badPath ? `“${badPath}” phải bắt đầu bằng “/” và không có khoảng trắng` : null}
        >
          <Textarea rows={4} value={v.hidePaths} placeholder={"/thi\n/exam-take"} className="font-mono text-[13px]" onChange={(e) => setV((s) => ({ ...s, hidePaths: e.target.value }))} />
        </Field>
      </div>
      <SaveBar
        dirty={dirty}
        busy={bar.busy}
        error={bar.error}
        saved={bar.saved}
        onSave={() => {
          if (badPath) return;
          void bar.run({ features: { textSelection: v.textSelection, selectionScope: v.selectionScope.trim(), selectionRoles: v.selectionRoles, hidePaths: linesOf(v.hidePaths) } });
        }}
        onReset={() => setV(init())}
      />
    </Card>
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
