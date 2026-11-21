"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../api";
import { ConfirmDialog } from "../ui/Modal";
import { Button } from "../ui/primitives";
import type { ProjectData } from "./types";

export function DangerTab({ project }: { project: ProjectData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-5">
      <h2 className="text-base font-semibold text-danger">Xoá dự án</h2>
      <p className="mt-1 text-sm leading-relaxed">
        Xoá dự án <strong>{project.name}</strong> kèm TOÀN BỘ dữ liệu của nó: {project.feedbackCount} góp ý cùng tin nhắn, sự kiện, tệp đính kèm, khoá worker và trí nhớ của worker. Không khôi phục được. Ứng dụng đang nhúng nút nổi sẽ ngừng gửi được góp ý.
      </p>
      <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>
        Xoá dự án này…
      </Button>
      <ConfirmDialog
        open={open}
        danger
        title="Xoá dự án và toàn bộ dữ liệu?"
        message={`Mọi góp ý, tệp và khoá của “${project.name}” sẽ bị xoá vĩnh viễn.`}
        requireText={project.slug}
        confirmLabel="Xoá vĩnh viễn"
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          const r = await api(`/api/admin/projects/${project.slug}`, { method: "DELETE", body: { confirm: project.slug } });
          if (!r.ok) return r.error;
          router.replace("/");
          router.refresh();
        }}
      />
    </div>
  );
}
