import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/env";
import { projectFeatures, projectTypes } from "@/lib/project-config";
import { contrastWarnings, parseTheme } from "@/lib/theme";
import { ProjectSettings } from "@/components/project/ProjectSettings";
import { requireAdminPage } from "../../auth";

export const metadata = { title: "Cài đặt dự án — Feedback Hub" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ProjectPage({ params, searchParams }: Props) {
  await requireAdminPage();
  const { slug } = await params;
  const tab = (await searchParams).tab;
  const p = await prisma.project.findUnique({
    where: { slug },
    include: {
      keys: { orderBy: { createdAt: "desc" }, select: { id: true, prefix: true, label: true, revokedAt: true, lastUsedAt: true, createdAt: true } },
      _count: { select: { feedback: true } },
    },
  });
  if (!p) notFound();
  const theme = parseTheme(p.theme);
  const themeValue = theme.ok ? theme.value : {};
  return (
    <ProjectSettings
      hubUrl={publicUrl()}
      initialTab={Array.isArray(tab) ? tab[0] : tab}
      initialWarnings={contrastWarnings(themeValue)}
      initial={{
        slug: p.slug,
        name: p.name,
        allowedOrigins: p.allowedOrigins,
        submitRoles: p.submitRoles,
        adminRoles: p.adminRoles,
        anonymousSubmit: p.anonymousSubmit,
        mode: p.mode,
        deliver: p.deliver,
        types: projectTypes(p),
        features: projectFeatures(p),
        theme: themeValue,
        webhookUrl: p.webhookUrl,
        workerSeenAt: p.workerSeenAt?.toISOString() ?? null,
        feedbackCount: p._count.feedback,
        keys: p.keys.map((k) => ({
          id: k.id,
          prefix: k.prefix,
          label: k.label,
          revokedAt: k.revokedAt?.toISOString() ?? null,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        })),
      }}
    />
  );
}
