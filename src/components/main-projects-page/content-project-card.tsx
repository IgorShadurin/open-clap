"use client";

import { useMemo } from "react";
import type { KeyboardEventHandler } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  Pause,
  Pencil,
  Play,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { buildProjectAvatar } from "../task-controls/project-avatar";
import { buildTaskScopeHref } from "../app-dashboard/helpers";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { isFinishedTask, type ProjectTree } from "./content-helpers";
import { preventControlDragStart, stopDragPropagation } from "../../lib/drag-drop";
import { MainProjectsPageProjectTasksSection } from "./content-project-tasks-section";
import { MainProjectsPageSubprojectsSection } from "./content-subprojects-section";
import type { MainProjectsPageController } from "./content-controller";

interface MainProjectsPageProjectCardProps {
  controller: MainProjectsPageController;
  project: ProjectTree;
  projectCollapsed: boolean;
  projectTasksVisible: boolean;
  projectSubprojectsVisible: boolean;
}

export const MainProjectsPageProjectCard = ({
  controller,
  project,
  projectCollapsed,
  projectTasksVisible,
  projectSubprojectsVisible,
}: MainProjectsPageProjectCardProps) => {
  const {
    handleProjectDrop,
    handleProjectPauseToggle,
    handleProjectCollapsedToggle,
    handleProjectIconDelete,
    startProjectNameEdit,
    cancelProjectNameEdit,
    saveProjectNameEdit,
    setEditingProjectName,
    editingProjectId,
    editingProjectName,
    editingProjectSubmitting,
    setProjectIconPickerProjectId,
    projectIconUploadProjectId,
    projectIconDeleteProjectId,
    setClearProjectTasksTarget,
    setOpenProjectMenuId,
    openProjectMenuId,
    openProjectIconMenuId,
    setOpenProjectIconMenuId,
    setDeleteProjectTarget,
    setProjectIconLoadErrors,
    projectIconLoadErrors,
    projectIconCacheBustByProjectId,
    setDraggingProjectId,
    shouldBlockContainerDragStart,
    projectIconInputRef,
  } = controller;

  const projectAvatar = buildProjectAvatar(project.name);
  const hasUploadedIcon = Boolean(project.iconPath);
  const projectIconCacheBust = projectIconCacheBustByProjectId[project.id] ?? 0;
  const projectIconVersion = `${project.updatedAt}:${hasUploadedIcon ? "uploaded" : "project"}:${projectIconCacheBust}`;
  const projectIconSource = `/api/projects/${project.id}/icon?v=${encodeURIComponent(projectIconVersion)}`;
  const showFallbackAvatar = projectIconLoadErrors[project.id] ?? false;
  const visibleProjectTasks = useMemo(() => project.tasks.filter((task) => !isFinishedTask(task)), [project.tasks]);
  const clearProjectTasksCount =
    project.tasks.length + project.subprojects.reduce((count, subproject) => count + subproject.tasks.length, 0);

  const handleRenameKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveProjectNameEdit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelProjectNameEdit();
    }
  };

  return (
    <div
      className="cursor-grab active:cursor-grabbing"
      draggable
      key={project.id}
      onDragEnd={() => setDraggingProjectId(null)}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        if (shouldBlockContainerDragStart(event)) {
          event.preventDefault();
          return;
        }
        setDraggingProjectId(project.id);
      }}
      onDrop={() => void handleProjectDrop(project.id)}
    >
      <Card>
        <CardHeader className={projectCollapsed ? "py-4" : undefined}>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                aria-label={project.paused ? "Resume project" : "Pause project"}
                className={`h-9 w-9 rounded-full p-0 ${
                  project.paused
                    ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                }`}
                draggable={false}
                onDragStart={preventControlDragStart}
                onMouseDown={stopDragPropagation}
                onPointerDown={stopDragPropagation}
                onClick={() => void handleProjectPauseToggle({ id: project.id, paused: project.paused })}
                size="sm"
                title={project.paused ? "Resume project" : "Pause project"}
                type="button"
                variant="outline"
              >
                {project.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                <span className="sr-only">{project.paused ? "Resume project" : "Pause project"}</span>
              </Button>

              <div className="relative" data-project-icon-menu>
                <button
                  aria-expanded={openProjectIconMenuId === project.id}
                  aria-haspopup="menu"
                  aria-label={`Project icon options for ${project.name}`}
                  className="rounded-full"
                  draggable={false}
                  onDragStart={preventControlDragStart}
                  onMouseDown={stopDragPropagation}
                  onPointerDown={stopDragPropagation}
                  onClick={() => {
                    setOpenProjectMenuId(null);
                    setOpenProjectIconMenuId((current) => (current === project.id ? null : project.id));
                  }}
                  type="button"
                >
                  {showFallbackAvatar ? (
                    <div
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tracking-wide shadow-sm ring-1 ring-black/10"
                      style={{
                        backgroundColor: projectAvatar.backgroundColor,
                        borderColor: projectAvatar.borderColor,
                        color: projectAvatar.textColor,
                      }}
                    >
                      {projectAvatar.initials}
                    </div>
                  ) : (
                    <div
                      aria-hidden="true"
                      className={`h-9 w-9 shrink-0 overflow-hidden ${
                        hasUploadedIcon
                          ? "rounded-full border border-zinc-300 bg-zinc-100 shadow-sm ring-1 ring-black/10"
                          : "rounded-none border-0 bg-transparent shadow-none ring-0"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt=""
                        aria-hidden="true"
                        className={`h-full w-full ${hasUploadedIcon ? "object-cover" : "object-contain"}`}
                        decoding="async"
                        draggable={false}
                        height={36}
                        loading="eager"
                        onError={() => {
                          setProjectIconLoadErrors((previous) => ({
                            ...previous,
                            [project.id]: true,
                          }));
                        }}
                        onLoad={() => {
                          setProjectIconLoadErrors((previous) => {
                            if (!previous[project.id]) {
                              return previous;
                            }
                            const next = { ...previous };
                            delete next[project.id];
                            return next;
                          });
                        }}
                        src={projectIconSource}
                        width={36}
                      />
                    </div>
                  )}
                </button>
                {openProjectIconMenuId === project.id ? (
                  <div className="absolute left-0 z-20 mt-1 min-w-[185px] rounded-md border border-black/10 bg-white p-1 shadow-lg" role="menu">
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                      disabled={projectIconUploadProjectId === project.id}
                      onMouseDown={stopDragPropagation}
                      onPointerDown={stopDragPropagation}
                      onClick={() => {
                        setOpenProjectIconMenuId(null);
                        setProjectIconPickerProjectId(project.id);
                        projectIconInputRef.current?.click();
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <Upload className="h-4 w-4" />
                      <span>Upload image</span>
                    </button>
                    {hasUploadedIcon ? (
                      <button
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                        disabled={projectIconDeleteProjectId === project.id}
                        onMouseDown={stopDragPropagation}
                        onPointerDown={stopDragPropagation}
                        onClick={() => {
                          setOpenProjectIconMenuId(null);
                          void handleProjectIconDelete(project.id);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <X className="h-4 w-4" />
                        <span>Delete</span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {editingProjectId === project.id ? (
                <div className="flex items-center gap-1" onMouseDown={stopDragPropagation} onPointerDown={stopDragPropagation}>
                  <Input
                    autoFocus
                    className="h-8 w-[220px]"
                    draggable={false}
                    onChange={(event) => setEditingProjectName(event.target.value)}
                    onDragStart={preventControlDragStart}
                    onKeyDown={handleRenameKeyDown}
                    onMouseDown={stopDragPropagation}
                    onPointerDown={stopDragPropagation}
                    value={editingProjectName}
                  />
                  <Button
                    aria-label="Save project name"
                    className="h-8 w-8 p-0"
                    disabled={editingProjectSubmitting}
                    draggable={false}
                    onDragStart={preventControlDragStart}
                    onMouseDown={stopDragPropagation}
                    onPointerDown={stopDragPropagation}
                    onClick={() => void saveProjectNameEdit()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label="Cancel project rename"
                    className="h-8 w-8 p-0"
                    disabled={editingProjectSubmitting}
                    draggable={false}
                    onDragStart={preventControlDragStart}
                    onMouseDown={stopDragPropagation}
                    onPointerDown={stopDragPropagation}
                    onClick={cancelProjectNameEdit}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="group/project-name flex items-center gap-1">
                  <Link
                    className="font-medium underline-offset-4 hover:underline"
                    href={buildTaskScopeHref(project.id)}
                  >
                    {project.name}
                  </Link>
                  <Button
                    aria-label={`Rename project ${project.name}`}
                    className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover/project-name:opacity-100"
                    draggable={false}
                    onDragStart={preventControlDragStart}
                    onMouseDown={stopDragPropagation}
                    onPointerDown={stopDragPropagation}
                    onClick={() => startProjectNameEdit({ id: project.id, name: project.name })}
                    size="sm"
                    title={`Rename project ${project.name}`}
                    type="button"
                    variant="ghost"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {projectCollapsed ? <span className="max-w-[42ch] truncate text-xs font-normal text-zinc-500">{project.path}</span> : null}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                aria-label={projectCollapsed ? "Expand project" : "Collapse project to simple line"}
                className="h-8 w-8 rounded-full p-0"
                draggable={false}
                onDragStart={preventControlDragStart}
                onMouseDown={stopDragPropagation}
                onPointerDown={stopDragPropagation}
                onClick={() =>
                  void handleProjectCollapsedToggle({
                    id: project.id,
                    mainPageCollapsed: project.mainPageCollapsed,
                    name: project.name,
                  })
                }
                size="sm"
                title={projectCollapsed ? "Expand project" : "Collapse project to simple line"}
                type="button"
                variant="outline"
              >
                {projectCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                <span className="sr-only">
                  {projectCollapsed ? "Expand project" : "Collapse project to simple line"}
                </span>
              </Button>
              <div className="relative" data-project-actions-menu>
                <Button
                  aria-expanded={openProjectMenuId === project.id}
                  aria-haspopup="menu"
                  aria-label={`Project actions for ${project.name}`}
                  className="h-8 w-8 rounded-full border-black/15 p-0 text-black/70 hover:bg-black/5 hover:text-black"
                  draggable={false}
                  onDragStart={preventControlDragStart}
                  onMouseDown={stopDragPropagation}
                  onPointerDown={stopDragPropagation}
                  onClick={() =>
                    setOpenProjectMenuId((current) => (current === project.id ? null : project.id))
                  }
                  size="sm"
                  title={`Project actions for ${project.name}`}
                  type="button"
                  variant="outline"
                >
                  <EllipsisVertical className="h-4 w-4" />
                  <span className="sr-only">Project actions</span>
                </Button>
                {openProjectMenuId === project.id ? (
                  <div
                    className="absolute right-0 z-20 mt-1 min-w-[190px] rounded-md border border-black/10 bg-white p-1 shadow-lg"
                    role="menu"
                  >
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                      onMouseDown={stopDragPropagation}
                      onPointerDown={stopDragPropagation}
                      onClick={() => {
                        setOpenProjectMenuId(null);
                        setDeleteProjectTarget({ id: project.id, name: project.name });
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <X className="h-4 w-4" />
                      <span>Delete</span>
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
                      onMouseDown={stopDragPropagation}
                      onPointerDown={stopDragPropagation}
                      onClick={() => {
                        setOpenProjectMenuId(null);
                        setClearProjectTasksTarget({
                          id: project.id,
                          name: project.name,
                          taskCount: clearProjectTasksCount,
                        });
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Clear tasks</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </CardTitle>

          {projectCollapsed ? null : <div className="text-xs text-zinc-600">{project.path}</div>}
        </CardHeader>

        {projectCollapsed ? null : (
          <CardContent>
            <div className="space-y-4">
              <MainProjectsPageSubprojectsSection
                project={project}
                controller={controller}
                projectSubprojectsVisible={projectSubprojectsVisible}
              />
              <MainProjectsPageProjectTasksSection
                controller={controller}
                project={project}
                projectTasksVisible={projectTasksVisible}
                visibleProjectTasks={visibleProjectTasks}
              />
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
