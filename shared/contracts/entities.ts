import type { DaemonTaskStatus } from "./task";

export type PathSortMode = "modified" | "name";

export interface ProjectEntity {
  createdAt: string;
  id: string;
  mainPageSubprojectsVisible: boolean;
  mainPageTasksVisible: boolean;
  metadata: string | null;
  name: string;
  path: string;
  paused: boolean;
  priority: number;
  updatedAt: string;
}

export interface SubprojectEntity {
  createdAt: string;
  id: string;
  metadata: string | null;
  name: string;
  path: string;
  paused: boolean;
  priority: number;
  projectId: string;
  updatedAt: string;
}

export type TaskEntityStatus = DaemonTaskStatus | "paused";

export interface TaskEntity {
  createdAt: string;
  editLocked: boolean;
  id: string;
  includePreviousContext: boolean;
  model: string;
  paused: boolean;
  previousContextMessages: number;
  priority: number;
  projectId: string;
  reasoning: string;
  status: TaskEntityStatus;
  subprojectId: string | null;
  text: string;
  updatedAt: string;
}

export interface TaskResponseEntity {
  createdAt: string;
  fullText: string;
  id: string;
  taskId: string;
}

export interface ProjectTreeItem extends ProjectEntity {
  subprojects: SubprojectEntity[];
  tasks: TaskEntity[];
}

export interface SettingRecord {
  dbValue: string | null;
  defaultValue: string | null;
  effectiveValue: string;
  envValue: string | null;
  key: string;
  source: "db" | "default" | "env";
}
