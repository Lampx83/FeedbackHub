"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { api } from "../api";
import { MODE_LABEL } from "../labels";
import { Badge, PageHeader, Tabs } from "../ui/primitives";
import { DangerTab } from "./DangerTab";
import { FeaturesTab } from "./FeaturesTab";
import { GeneralTab } from "./GeneralTab";
import { KeysEmbedTab } from "./KeysEmbedTab";
import { ModeTab } from "./ModeTab";
import { ThemeTab } from "./ThemeTab";
import { TypesTab } from "./TypesTab";
import type { ProjectData, Save } from "./types";
import type { KeyRow } from "../KeysBoard";

const TABS = [
  { id: "general", label: "Chung" },
  { id: "mode", label: "Chế độ" },
  { id: "types", label: "Loại góp ý" },
  { id: "features", label: "Tính năng" },
  { id: "theme", label: "Giao diện" },
  { id: "keys", label: "Khoá & nhúng" },
  { id: "danger", label: "Nguy hiểm" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function ProjectSettings({ initial, initialTab, initialWarnings, hubUrl }: { initial: ProjectData; initialTab?: string; initialWarnings: string[]; hubUrl: string }) {
  const [project, setProject] = useState(initial);
  const [warnings, setWarnings] = useState(initialWarnings);
  const [tab, setTabState] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : "general");

  const setTab = (t: TabId) => {
    setTabState(t);
    window.history.replaceState(null, "", t === "general" ? `/projects/${project.slug}` : `/projects/${project.slug}?tab=${t}`);
  };

  const save: Save = useCallback(
    async (patch) => {
      const r = await api<{ warnings?: string[] }>(`/api/admin/projects/${initial.slug}`, { method: "PATCH", body: patch });
      if (!r.ok) return { ok: false, error: r.error };
      setProject((p) => {
        const next = { ...p, ...patch } as ProjectData;
        // Máy chủ trộn `features` theo từng khoá, nên giữ nốt phần không gửi.
        if (patch.features) next.features = { ...p.features, ...patch.features };
        return next;
      });
      const w = r.data.warnings ?? [];
      setWarnings(w);
      return { ok: true, warnings: w };
    },
    [initial.slug],
  );

  const reloadKeys = useCallback(async () => {
    const r = await api<{ project: { keys: KeyRow[] } }>(`/api/admin/projects/${initial.slug}`);
    if (r.ok) setProject((p) => ({ ...p, keys: r.data.project.keys }));
  }, [initial.slug]);

  return (
    <>
      <nav aria-label="Đường dẫn" className="mb-2 text-sm text-muted">
        <Link href="/" className="hover:text-fg hover:underline">
          Tổng quan
        </Link>
        <span aria-hidden> / </span>
        <span className="font-mono">{project.slug}</span>
      </nav>
      <PageHeader
        title={project.name}
        description={
          <>
            Cài đặt của dự án <span className="font-mono">{project.slug}</span>: ứng dụng nào được gửi góp ý, ai xử lý, nút nổi trông thế nào và cách nối vào ứng dụng.{" "}
            <Link href={`/board?project=${encodeURIComponent(project.slug)}`} className="font-medium text-brand hover:underline">
              Xem góp ý của dự án
            </Link>
          </>
        }
      >
        <Badge className={project.mode === "execute" ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted ring-1 ring-inset ring-line"}>{MODE_LABEL[project.mode] ?? project.mode}</Badge>
      </PageHeader>
      <Tabs tabs={[...TABS]} value={tab} onChange={setTab} />
      {tab === "general" ? <GeneralTab project={project} save={save} /> : null}
      {tab === "mode" ? <ModeTab project={project} save={save} /> : null}
      {tab === "types" ? <TypesTab project={project} save={save} /> : null}
      {tab === "features" ? <FeaturesTab project={project} save={save} /> : null}
      {tab === "theme" ? <ThemeTab project={project} save={save} warnings={warnings} /> : null}
      {tab === "keys" ? <KeysEmbedTab project={project} hubUrl={hubUrl} reloadKeys={reloadKeys} /> : null}
      {tab === "danger" ? <DangerTab project={project} /> : null}
    </>
  );
}
