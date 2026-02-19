"use client";

import { useParams, useSearchParams } from "next/navigation";

import { ProjectTasksPage } from "@/components/project-tasks-page";

export default function ProjectTasksRoutePage() {
  const params = useParams<{ projectId: string | string[] }>();
  const searchParams = useSearchParams();

  const projectIdRaw = params.projectId;
  const projectId = Array.isArray(projectIdRaw) ? projectIdRaw[0] : projectIdRaw;
  const subprojectId = searchParams.get("subprojectId");

  if (!projectId) {
    return <div className="p-8 text-sm text-red-600">Project ID is missing.</div>;
  }

  return <ProjectTasksPage projectId={projectId} subprojectId={subprojectId} />;
}
