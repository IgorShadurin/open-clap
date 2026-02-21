import type { DaemonTaskStatus } from "./task";

export type PathSortMode = "modified" | "name";

export interface ProjectEntity {
  createdAt: string;
  id: string;
  iconPath: string | null;
  mainPageCollapsed: boolean;
  mainPageSubprojectsVisible: boolean;
  mainPageTasksVisible: boolean;
  metadata: string | null;
  name: string;
  path: string;
  paused: boolean;
  priority: number;
  updatedAt: string;
}

export interface InstructionSetEntity {
  createdAt: string;
  description: string | null;
  id: string;
  imagePath: string | null;
  mainPageTasksVisible: boolean;
  name: string;
  priority: number;
  updatedAt: string;
}

export interface InstructionTaskEntity {
  createdAt: string;
  id: string;
  includePreviousContext: boolean;
  instructionSetId: string;
  model: string;
  paused: boolean;
  previousContextMessages: number;
  priority: number;
  reasoning: string;
  text: string;
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

export interface InstructionSetTreeItem extends InstructionSetEntity {
  tasks: InstructionTaskEntity[];
}

export interface SettingRecord {
  dbValue: string | null;
  defaultValue: string | null;
  effectiveValue: string;
  envValue: string | null;
  key: string;
  source: "db" | "default" | "env";
}
