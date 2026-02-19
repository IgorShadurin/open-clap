-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subproject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subproject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "subprojectId" TEXT,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "editLocked" BOOLEAN NOT NULL DEFAULT false,
    "includePreviousContext" BOOLEAN NOT NULL DEFAULT false,
    "previousContextMessages" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT 'gpt-5.3-codex',
    "reasoning" TEXT NOT NULL DEFAULT 'high',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inProgressAt" DATETIME,
    "doneAt" DATETIME,
    "failedAt" DATETIME,
    "stoppedAt" DATETIME,
    "statusUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_subprojectId_fkey" FOREIGN KEY ("subprojectId") REFERENCES "Subproject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "command" TEXT,
    "prompt" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "executionId" TEXT,
    "fullText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskResponse_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskResponse_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "TaskExecution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImmediateAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'force_stop',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "executedAt" DATETIME,
    CONSTRAINT "ImmediateAction_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Project_priority_idx" ON "Project"("priority");

-- CreateIndex
CREATE INDEX "Subproject_projectId_priority_idx" ON "Subproject"("projectId", "priority");

-- CreateIndex
CREATE INDEX "Task_projectId_priority_idx" ON "Task"("projectId", "priority");

-- CreateIndex
CREATE INDEX "Task_subprojectId_priority_idx" ON "Task"("subprojectId", "priority");

-- CreateIndex
CREATE INDEX "Task_status_priority_idx" ON "Task"("status", "priority");

-- CreateIndex
CREATE INDEX "TaskExecution_taskId_startedAt_idx" ON "TaskExecution"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "TaskResponse_taskId_createdAt_idx" ON "TaskResponse"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ImmediateAction_status_createdAt_idx" ON "ImmediateAction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImmediateAction_taskId_status_idx" ON "ImmediateAction"("taskId", "status");
