"use client";

import { useMemo, useState } from "react";
import { AddButton, ConfirmDialog, Modal } from "../ui/Modal";
import { Alert, Button, Card, EmptyState, Field, Input, KindBadge, SearchInput, Select, Spinner, Toolbar } from "../ui/primitives";
import { KINDS, KIND_LABEL, type Kind, type TypeDef } from "@/lib/status";
import type { ProjectData, Save } from "./types";

const MAX_TYPES = 20;

export function TypesTab({ project, save }: { project: ProjectData; save: Save }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const types = project.types;

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return types.map((t, index) => ({ t, index })).filter(({ t }) => !n || t.label.toLowerCase().includes(n) || t.id.includes(n));
  }, [types, q]);

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold">Loại góp ý</h2>
      <p className="mb-3 text-sm leading-relaxed text-muted">
        Danh sách loại mà người gửi chọn trong nút nổi. “Nhóm xử lý” là phân loại chuẩn của hub, quyết định cách tính và ai xử lý (ví dụ câu hỏi không tính vào việc đang mở). Mã loại không đổi được sau khi tạo vì góp ý cũ đã ghi mã này.
      </p>
      <Toolbar left={<SearchInput value={q} onChange={setQ} placeholder="Tìm loại theo nhãn hoặc mã…" />} right={<AddButton onClick={() => setEditing({ index: null })}>Thêm loại</AddButton>} />
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      {shown.length === 0 ? (
        <EmptyState title="Không có loại nào khớp từ khoá" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {shown.map(({ t, index }) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate font-medium">{t.label}</div>
                  <div className="font-mono text-xs text-muted">{t.id}</div>
                </div>
                <KindBadge kind={t.kind} />
                <div className="flex gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => setEditing({ index })}>
                    Sửa
                  </Button>
                  <Button variant="secondary" size="sm" disabled={types.length <= 1} onClick={() => setDeleting(index)}>
                    Xoá
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editing ? (
        <TypeForm
          existing={editing.index === null ? null : types[editing.index]}
          taken={types.map((t) => t.id)}
          atLimit={editing.index === null && types.length >= MAX_TYPES}
          onClose={() => setEditing(null)}
          onSubmit={async (t) => {
            const next = editing.index === null ? [...types, t] : types.map((x, i) => (i === editing.index ? t : x));
            const r = await save({ types: next });
            if (!r.ok) return r.error;
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        danger
        title="Xoá loại góp ý"
        message={
          <>
            Xoá loại <strong>{deleting !== null ? types[deleting]?.label : ""}</strong> khỏi nút nổi. Góp ý đã gửi theo loại này vẫn được giữ nguyên.
          </>
        }
        confirmLabel="Xoá loại"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const r = await save({ types: types.filter((_, i) => i !== deleting) });
          if (!r.ok) return r.error;
          setError(null);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function TypeForm({ existing, taken, atLimit, onClose, onSubmit }: { existing: TypeDef | null; taken: string[]; atLimit: boolean; onClose: () => void; onSubmit: (t: TypeDef) => Promise<string | void> }) {
  const [id, setId] = useState(existing?.id ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idErr = !existing && id && !/^[a-z0-9_-]{1,40}$/.test(id) ? "Mã loại: chữ thường, số, gạch ngang hoặc gạch dưới (tối đa 40 ký tự)." : !existing && taken.includes(id) ? "Mã loại này đã có." : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await onSubmit({ id, label: label.trim(), kind });
    setBusy(false);
    if (typeof err === "string") setError(err);
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={existing ? "Sửa loại góp ý" : "Thêm loại góp ý"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="submit" form="type-form" disabled={busy || atLimit || !id || !label.trim() || !!idErr}>
            {busy ? <Spinner /> : null}
            {existing ? "Lưu" : "Thêm"}
          </Button>
        </>
      }
    >
      <form id="type-form" onSubmit={submit} className="space-y-4">
        {atLimit ? <Alert tone="warn">Đã đủ {MAX_TYPES} loại, hãy xoá bớt trước khi thêm.</Alert> : null}
        <Field label="Nhãn hiển thị" hint="Chữ người gửi thấy, ví dụ “Báo lỗi”.">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Mã loại" error={idErr} hint={existing ? "Không đổi được sau khi tạo." : "Mã kỹ thuật, ví dụ bug."}>
          <Input value={id} onChange={(e) => setId(e.target.value.toLowerCase())} disabled={!!existing} className="font-mono" maxLength={40} />
        </Field>
        <Field label="Nhóm xử lý" hint="Phân loại chuẩn của hub dùng để thống kê và định tuyến.">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </form>
    </Modal>
  );
}
