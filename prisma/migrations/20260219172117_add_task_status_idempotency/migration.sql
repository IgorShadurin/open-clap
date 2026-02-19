-- CreateTable
CREATE TABLE "TaskStatusUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    CONSTRAINT "TaskStatusUpdate_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskStatusUpdate_idempotencyKey_key" ON "TaskStatusUpdate"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TaskStatusUpdate_taskId_createdAt_idx" ON "TaskStatusUpdate"("taskId", "createdAt");
