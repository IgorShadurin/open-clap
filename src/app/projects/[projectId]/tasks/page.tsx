import type { Metadata } from "next";

import { ProjectTasksPage } from "@/components/project-tasks-page";

export const metadata: Metadata = {
  title: "Tasks",
  description:
    "View and manage OpenClap task execution for a project or subproject, including ordering, pause/resume, and responses.",
  keywords: [
    "project tasks",
    "subproject tasks",
    "task execution control",
    "pause resume tasks",
    "task response history",
    "OpenClap tasks",
  ],
};

interface ProjectTasksRoutePageProps {
  params: {
    projectId: string;
  };
  searchParams?: {
    subprojectId?: string | string[];
  };
}

function pickSingleParam(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default function ProjectTasksRoutePage({
  params,
  searchParams,
}: ProjectTasksRoutePageProps) {
  const projectId = params.projectId;
  const subprojectId = pickSingleParam(searchParams?.subprojectId);

  if (!projectId) {
    return <div className="p-8 text-sm text-red-600">Project ID is missing.</div>;
  }

  return <ProjectTasksPage projectId={projectId} subprojectId={subprojectId} />;
}
