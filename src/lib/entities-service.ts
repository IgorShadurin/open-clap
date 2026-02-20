import { TaskStatus, type Prisma } from "@prisma/client";

import type {
  ProjectEntity,
  TaskResponseEntity,
  SubprojectEntity,
  TaskEntity,
} from "../../shared/contracts";
import { publishAppSync } from "./live-sync";
import { DEFAULT_TASK_REASONING } from "./task-reasoning";
import { normalizeUserPath, validatePathExists } from "./path-validation";
import { prisma } from "./prisma";

function stringifyMetadata(value: Prisma.JsonValue | null): string | null {
  if (value === null) {
    return null;
  }

  return JSON.stringify(value);
}

function toProjectEntity(project: {
  createdAt: Date;
  id: string;
  mainPageSubprojectsVisible: boolean;
  mainPageTasksVisible: boolean;
  metadata: Prisma.JsonValue | null;
  name: string;
  path: string;
  paused: boolean;
  priority: number;
  updatedAt: Date;
}): ProjectEntity {
  return {
    createdAt: project.createdAt.toISOString(),
    id: project.id,
    mainPageSubprojectsVisible: project.mainPageSubprojectsVisible,
    mainPageTasksVisible: project.mainPageTasksVisible,
    metadata: stringifyMetadata(project.metadata),
    name: project.name,
    path: project.path,
    paused: project.paused,
    priority: project.priority,
    updatedAt: project.updatedAt.toISOString(),
  };
}

function toSubprojectEntity(subproject: {
  createdAt: Date;
  id: string;
  metadata: Prisma.JsonValue | null;
  name: string;
  path: string;
  paused: boolean;
  priority: number;
  projectId: string;
  updatedAt: Date;
}): SubprojectEntity {
  return {
    createdAt: subproject.createdAt.toISOString(),
    id: subproject.id,
    metadata: stringifyMetadata(subproject.metadata),
    name: subproject.name,
    path: subproject.path,
    paused: subproject.paused,
    priority: subproject.priority,
    projectId: subproject.projectId,
    updatedAt: subproject.updatedAt.toISOString(),
  };
}

function toTaskEntity(task: {
  createdAt: Date;
  editLocked: boolean;
  id: string;
  includePreviousContext: boolean;
  model: string;
  paused: boolean;
  previousContextMessages: number;
  priority: number;
  projectId: string;
  reasoning: string;
  status: TaskStatus;
  subprojectId: string | null;
  text: string;
  updatedAt: Date;
}): TaskEntity {
  return {
    createdAt: task.createdAt.toISOString(),
    editLocked: task.editLocked,
    id: task.id,
    includePreviousContext: task.includePreviousContext,
    model: task.model,
    paused: task.paused,
    previousContextMessages: task.previousContextMessages,
    priority: task.priority,
    projectId: task.projectId,
    reasoning: task.reasoning,
    status: task.status,
    subprojectId: task.subprojectId,
    text: task.text,
    updatedAt: task.updatedAt.toISOString(),
  };
}

async function assertDirectoryPathExists(inputPath: string): Promise<void> {
  const validation = await validatePathExists(inputPath);
  if (!validation.exists || !validation.isDirectory) {
    throw new Error(`Path does not exist or is not a directory: ${inputPath}`);
  }
}

async function assertSubprojectPathNotDuplicated(options: {
  excludeSubprojectId?: string;
  inputPath: string;
  projectId: string;
}): Promise<void> {
  const normalizedInputPath = normalizeUserPath(options.inputPath);

  const project = await prisma.project.findUnique({
    select: { path: true },
    where: { id: options.projectId },
  });
  if (!project) {
    throw new Error("Project not found");
  }

  if (normalizeUserPath(project.path) === normalizedInputPath) {
    throw new Error("Subproject path must be different from project path");
  }

  const existingSubprojects = await prisma.subproject.findMany({
    select: { path: true },
    where: {
      id: options.excludeSubprojectId
        ? {
            not: options.excludeSubprojectId,
          }
        : undefined,
      projectId: options.projectId,
    },
  });

  const hasConflict = existingSubprojects.some(
    (item) => normalizeUserPath(item.path) === normalizedInputPath,
  );
  if (hasConflict) {
    throw new Error("Subproject path is already used in this project");
  }
}

function parseMetadata(metadata: string | undefined): Prisma.InputJsonValue | undefined {
  if (typeof metadata !== "string" || metadata.trim().length < 1) {
    return undefined;
  }

  const parsed = JSON.parse(metadata) as Prisma.InputJsonValue | null;
  return parsed === null ? undefined : parsed;
}

async function nextPriority(
  table: "project" | "subproject" | "task",
  where?: Prisma.SubprojectWhereInput | Prisma.TaskWhereInput,
): Promise<number> {
  if (table === "project") {
    const latest = await prisma.project.findFirst({
      orderBy: [{ priority: "desc" }],
      select: { priority: true },
    });
    return latest ? latest.priority + 1 : 0;
  }

  if (table === "subproject") {
    const latest = await prisma.subproject.findFirst({
      orderBy: [{ priority: "desc" }],
      select: { priority: true },
      where: where as Prisma.SubprojectWhereInput | undefined,
    });
    return latest ? latest.priority + 1 : 0;
  }

  const latest = await prisma.task.findFirst({
    orderBy: [{ priority: "desc" }],
    select: { priority: true },
    where: where as Prisma.TaskWhereInput | undefined,
  });
  return latest ? latest.priority + 1 : 0;
}

export async function listProjects(): Promise<ProjectEntity[]> {
  const projects = await prisma.project.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  return projects.map(toProjectEntity);
}

export async function listProjectTree(): Promise<
  Array<
    ProjectEntity & {
      subprojects: Array<SubprojectEntity & { tasks: TaskEntity[] }>;
      tasks: TaskEntity[];
    }
  >
> {
  const projects = await prisma.project.findMany({
    include: {
      subprojects: {
        include: {
          tasks: {
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      },
      tasks: {
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        where: {
          subprojectId: null,
        },
      },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  return projects.map((project) => ({
    ...toProjectEntity(project),
    subprojects: project.subprojects.map((subproject) => ({
      ...toSubprojectEntity(subproject),
      tasks: subproject.tasks.map(toTaskEntity),
    })),
    tasks: project.tasks.map(toTaskEntity),
  }));
}

export async function createProject(input: {
  metadata?: string;
  name: string;
  path: string;
}): Promise<ProjectEntity> {
  await assertDirectoryPathExists(input.path);
  const priority = await nextPriority("project");
  const project = await prisma.project.create({
    data: {
      metadata: parseMetadata(input.metadata),
      name: input.name,
      path: input.path,
      priority,
    },
  });
  publishAppSync("project.created");
  return toProjectEntity(project);
}

export async function updateProject(
  projectId: string,
  input: Partial<{
    mainPageSubprojectsVisible: boolean;
    mainPageTasksVisible: boolean;
    metadata: string;
    name: string;
    path: string;
    paused: boolean;
  }>,
): Promise<ProjectEntity> {
  if (input.path) {
    await assertDirectoryPathExists(input.path);
  }

  const updateData: Prisma.ProjectUpdateInput = {
    mainPageSubprojectsVisible: input.mainPageSubprojectsVisible,
    mainPageTasksVisible: input.mainPageTasksVisible,
    metadata: input.metadata ? parseMetadata(input.metadata) : undefined,
    name: input.name,
    path: input.path,
    paused: input.paused,
  };

  if (typeof input.paused === "boolean") {
    const [project] = await prisma.$transaction([
      prisma.project.update({
        data: updateData,
        where: {
          id: projectId,
        },
      }),
      prisma.subproject.updateMany({
        data: { paused: input.paused },
        where: { projectId },
      }),
    ]);
    publishAppSync("project.updated");
    return toProjectEntity(project);
  }

  const project = await prisma.project.update({
    data: updateData,
    where: {
      id: projectId,
    },
  });
  publishAppSync("project.updated");
  return toProjectEntity(project);
}

export async function deleteProject(projectId: string): Promise<void> {
  await prisma.project.delete({
    where: {
      id: projectId,
    },
  });
  publishAppSync("project.deleted");
}

export async function reorderProjects(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((projectId, index) =>
      prisma.project.update({
        data: { priority: index },
        where: { id: projectId },
      }),
    ),
  );
  publishAppSync("project.reordered");
}

export async function moveProject(
  projectId: string,
  direction: "up" | "down",
): Promise<void> {
  const projects = await prisma.project.findMany({
    orderBy: [{ priority: "asc" }],
    select: { id: true, priority: true },
  });

  const index = projects.findIndex((project) => project.id === projectId);
  if (index < 0) {
    throw new Error("Project not found");
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= projects.length) {
    return;
  }

  const reordered = projects.map((project) => project.id);
  const [removed] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, removed);
  await reorderProjects(reordered);
}

export async function listSubprojects(projectId?: string): Promise<SubprojectEntity[]> {
  const subprojects = await prisma.subproject.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    where: projectId
      ? {
          projectId,
        }
      : undefined,
  });
  return subprojects.map(toSubprojectEntity);
}

export async function createSubproject(input: {
  metadata?: string;
  name: string;
  path: string;
  projectId: string;
}): Promise<SubprojectEntity> {
  await assertDirectoryPathExists(input.path);
  await assertSubprojectPathNotDuplicated({
    inputPath: input.path,
    projectId: input.projectId,
  });
  const priority = await nextPriority("subproject", {
    projectId: input.projectId,
  });
  const subproject = await prisma.subproject.create({
    data: {
      metadata: parseMetadata(input.metadata),
      name: input.name,
      path: input.path,
      priority,
      projectId: input.projectId,
    },
  });
  publishAppSync("subproject.created");
  return toSubprojectEntity(subproject);
}

export async function updateSubproject(
  subprojectId: string,
  input: Partial<{
    metadata: string;
    name: string;
    path: string;
    paused: boolean;
  }>,
): Promise<SubprojectEntity> {
  const existing = await prisma.subproject.findUnique({
    select: { projectId: true },
    where: { id: subprojectId },
  });
  if (!existing) {
    throw new Error("Subproject not found");
  }

  if (input.path) {
    await assertDirectoryPathExists(input.path);
    await assertSubprojectPathNotDuplicated({
      excludeSubprojectId: subprojectId,
      inputPath: input.path,
      projectId: existing.projectId,
    });
  }
  const subproject = await prisma.subproject.update({
    data: {
      metadata: input.metadata ? parseMetadata(input.metadata) : undefined,
      name: input.name,
      path: input.path,
      paused: input.paused,
    },
    where: { id: subprojectId },
  });
  publishAppSync("subproject.updated");
  return toSubprojectEntity(subproject);
}

export async function deleteSubproject(subprojectId: string): Promise<void> {
  await prisma.subproject.delete({
    where: {
      id: subprojectId,
    },
  });
  publishAppSync("subproject.deleted");
}

export async function reorderSubprojects(
  projectId: string,
  orderedIds: string[],
): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((subprojectId, index) =>
      prisma.subproject.update({
        data: { priority: index },
        where: { id: subprojectId, projectId },
      }),
    ),
  );
  publishAppSync("subproject.reordered");
}

export async function moveSubproject(
  subprojectId: string,
  direction: "up" | "down",
): Promise<void> {
  const subproject = await prisma.subproject.findUnique({
    select: { projectId: true },
    where: { id: subprojectId },
  });
  if (!subproject) {
    throw new Error("Subproject not found");
  }

  const items = await prisma.subproject.findMany({
    orderBy: [{ priority: "asc" }],
    select: { id: true, priority: true },
    where: { projectId: subproject.projectId },
  });
  const index = items.findIndex((item) => item.id === subprojectId);
  if (index < 0) {
    throw new Error("Subproject not found");
  }
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return;
  }
  const ordered = items.map((item) => item.id);
  const [removed] = ordered.splice(index, 1);
  ordered.splice(targetIndex, 0, removed);
  await reorderSubprojects(subproject.projectId, ordered);
}

export async function listTasks(filters?: {
  projectId?: string;
  subprojectId?: string | null;
}): Promise<TaskEntity[]> {
  const tasks = await prisma.task.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    where: {
      projectId: filters?.projectId,
      subprojectId:
        typeof filters?.subprojectId === "string"
          ? filters.subprojectId
          : filters?.subprojectId === null
            ? null
            : undefined,
    },
  });
  return tasks.map(toTaskEntity);
}

export async function createTask(input: {
  includePreviousContext?: boolean;
  model?: string;
  previousContextMessages?: number;
  projectId: string;
  reasoning?: string;
  subprojectId?: string | null;
  text: string;
}): Promise<TaskEntity> {
  const priority = await nextPriority("task", {
    projectId: input.projectId,
    subprojectId:
      typeof input.subprojectId === "string" ? input.subprojectId : input.subprojectId === null ? null : undefined,
  });

  const task = await prisma.task.create({
    data: {
      includePreviousContext: input.includePreviousContext ?? false,
      model: input.model ?? "gpt-5.3-codex",
      previousContextMessages: input.previousContextMessages ?? 0,
      priority,
      projectId: input.projectId,
      reasoning: input.reasoning ?? DEFAULT_TASK_REASONING,
      subprojectId:
        typeof input.subprojectId === "string" ? input.subprojectId : null,
      text: input.text,
    },
  });
  publishAppSync("task.created");
  return toTaskEntity(task);
}

export async function updateTask(
  taskId: string,
  input: Partial<{
    includePreviousContext: boolean;
    model: string;
    paused: boolean;
    previousContextMessages: number;
    reasoning: string;
    status: TaskStatus;
    text: string;
  }>,
): Promise<TaskEntity> {
  const existing = await prisma.task.findUnique({
    select: {
      editLocked: true,
      status: true,
    },
    where: { id: taskId },
  });
  if (!existing) {
    throw new Error("Task not found");
  }

  const editingFieldsTouched =
    input.text !== undefined ||
    input.model !== undefined ||
    input.reasoning !== undefined ||
    input.includePreviousContext !== undefined ||
    input.previousContextMessages !== undefined;

  if (
    editingFieldsTouched &&
    (existing.editLocked || existing.status === TaskStatus.in_progress)
  ) {
    throw new Error("Running tasks cannot be edited");
  }

  const task = await prisma.task.update({
    data: {
      includePreviousContext: input.includePreviousContext,
      model: input.model,
      paused: input.paused,
      previousContextMessages: input.previousContextMessages,
      reasoning: input.reasoning,
      status: input.status,
      text: input.text,
    },
    where: { id: taskId },
  });
  publishAppSync("task.updated");
  return toTaskEntity(task);
}

export async function deleteTask(taskId: string): Promise<void> {
  await prisma.task.delete({
    where: { id: taskId },
  });
  publishAppSync("task.deleted");
}

export async function reorderTasks(orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((taskId, index) =>
      prisma.task.update({
        data: { priority: index },
        where: { id: taskId },
      }),
    ),
  );
  publishAppSync("task.reordered");
}

export async function setTaskAction(
  taskId: string,
  action: "pause" | "remove" | "resume" | "stop",
): Promise<void> {
  if (action === "remove") {
    await deleteTask(taskId);
    return;
  }

  if (action === "pause") {
    await prisma.task.update({
      data: {
        paused: true,
        status: TaskStatus.paused,
      },
      where: { id: taskId },
    });
    publishAppSync("task.paused");
    return;
  }

  if (action === "resume") {
    await prisma.task.update({
      data: {
        paused: false,
        status: TaskStatus.created,
      },
      where: { id: taskId },
    });
    publishAppSync("task.resumed");
    return;
  }

  const task = await prisma.task.findUnique({
    select: {
      editLocked: true,
      id: true,
      status: true,
    },
    where: { id: taskId },
  });
  if (!task) {
    throw new Error("Task not found");
  }

  if (task.editLocked || task.status === TaskStatus.in_progress) {
    const existingImmediateAction = await prisma.immediateAction.findFirst({
      select: { id: true },
      where: {
        status: { in: ["pending", "acknowledged"] },
        taskId,
        type: "force_stop",
      },
    });

    if (!existingImmediateAction) {
      await prisma.immediateAction.create({
        data: {
          status: "pending",
          taskId,
          type: "force_stop",
        },
      });
      publishAppSync("task.stop_requested");
    }
    return;
  }

  await prisma.task.update({
    data: {
      paused: false,
      status: TaskStatus.stopped,
      stoppedAt: new Date(),
    },
    where: { id: taskId },
  });
  publishAppSync("task.stopped");
}

export async function listTaskResponses(
  taskId: string,
  limit = 20,
): Promise<TaskResponseEntity[]> {
  const normalizedLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  const responses = await prisma.taskResponse.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: normalizedLimit,
    where: { taskId },
  });

  return responses.map((response) => ({
    createdAt: response.createdAt.toISOString(),
    fullText: response.fullText,
    id: response.id,
    taskId: response.taskId,
  }));
}
