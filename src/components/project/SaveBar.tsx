"use client";

import { useState } from "react";
import { Alert, Button, Spinner } from "../ui/primitives";
import type { Save, SaveResult } from "./types";

/** Thanh lưu cuối mỗi biểu mẫu: chỉ bật khi có thay đổi, hiện lỗi và dấu "Đã lưu". */
export function useSaveBar(save: Save) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function run(patch: Parameters<Save>[0]): Promise<SaveResult> {
    setBusy(true);
    setError(null);
    setSaved(false);
    const r = await save(patch);
    setBusy(false);
    if (r.ok) setSaved(true);
    else setError(r.error);
    return r;
  }
  return { busy, error, saved, run, clearSaved: () => setSaved(false) };
}

export function SaveBar({ dirty, busy, error, saved, onSave, onReset, disabledReason }: { dirty: boolean; busy: boolean; error: string | null; saved: boolean; onSave: () => void; onReset?: () => void; disabledReason?: string | null }) {
  return (
    <div className="mt-5 space-y-2 border-t border-line pt-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {disabledReason && dirty ? <p className="text-[13px] text-danger">{disabledReason}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={!dirty || busy || !!disabledReason}>
          {busy ? <Spinner /> : null}
          Lưu thay đổi
        </Button>
        {onReset && dirty ? (
          <Button variant="secondary" onClick={onReset} disabled={busy}>
            Hoàn tác
          </Button>
        ) : null}
        {saved && !dirty ? <span className="text-sm text-emerald-700 dark:text-emerald-300">Đã lưu</span> : null}
        {dirty && !busy ? <span className="text-sm text-muted">Có thay đổi chưa lưu</span> : null}
      </div>
    </div>
  );
}
