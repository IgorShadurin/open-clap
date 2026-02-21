-- CreateTable
CREATE TABLE "InstructionSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imagePath" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InstructionTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instructionSetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "includePreviousContext" BOOLEAN NOT NULL DEFAULT false,
    "previousContextMessages" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT 'gpt-5.3-codex',
    "reasoning" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstructionTask_instructionSetId_fkey" FOREIGN KEY ("instructionSetId") REFERENCES "InstructionSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "InstructionSet_priority_idx" ON "InstructionSet"("priority");

-- CreateIndex
CREATE INDEX "InstructionTask_instructionSetId_priority_idx" ON "InstructionTask"("instructionSetId", "priority");
