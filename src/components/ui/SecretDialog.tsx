"use client";

import { Alert, Button, CopyButton } from "./primitives";
import { Modal } from "./Modal";

/** Hộp thoại hiện một khoá bí mật (chỉ hiện một lần với khoá lưu băm) kèm nút sao chép. */
export function SecretDialog({
  open,
  onClose,
  title,
  value,
  note,
  warning,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: string;
  note?: React.ReactNode;
  warning?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      persistent
      footer={
        <Button onClick={onClose}>Tôi đã lưu lại</Button>
      }
    >
      <div className="space-y-3">
        {warning ? <Alert tone="warn">{warning}</Alert> : null}
        <div className="flex items-stretch gap-2">
          <code className="min-w-0 flex-1 select-all break-all rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[13px]">{value}</code>
          <CopyButton text={value} size="md" />
        </div>
        {note ? <div className="text-sm text-muted">{note}</div> : null}
      </div>
    </Modal>
  );
}
