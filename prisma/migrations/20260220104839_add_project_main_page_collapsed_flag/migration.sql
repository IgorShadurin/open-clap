-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "mainPageCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "mainPageTasksVisible" BOOLEAN NOT NULL DEFAULT true,
    "mainPageSubprojectsVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("createdAt", "id", "mainPageSubprojectsVisible", "mainPageTasksVisible", "metadata", "name", "path", "paused", "priority", "updatedAt") SELECT "createdAt", "id", "mainPageSubprojectsVisible", "mainPageTasksVisible", "metadata", "name", "path", "paused", "priority", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE INDEX "Project_priority_idx" ON "Project"("priority");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
