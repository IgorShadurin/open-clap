import type { Metadata } from "next";

import { ProjectTasksPage } from "@/components/project-tasks-page";

export const metadata: Metadata = {
  title: "Tasks",
  description:
    "View and manage OpenClap task execution for a project and its subprojects, including ordering, pause/resume, and responses.",
  keywords: [
    "project tasks",
    "subprojects",
    "task execution control",
    "pause resume tasks",
    "task response history",
    "OpenClap tasks",
  ],
};

interface ProjectTasksRoutePageProps {
  params:
    | Promise<{
        projectId: string;
      }>
    | {
        projectId: string;
      };
}

async function resolveValue<T>(value: Promise<T> | T): Promise<T> {
  return value;
}

function normalizeId(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

export default async function ProjectTasksRoutePage({ params }: ProjectTasksRoutePageProps) {
  const resolvedParams = await resolveValue(params);
  const projectId = normalizeId(resolvedParams.projectId);

  if (!projectId) {
    return <div className="p-8 text-sm text-red-600">Project ID is missing.</div>;
  }

  return <ProjectTasksPage projectId={projectId} />;
}
