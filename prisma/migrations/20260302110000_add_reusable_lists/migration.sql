CREATE TABLE "ReusableList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ReusableListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReusableListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ReusableList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReusableListItem_listId_priority_idx" ON "ReusableListItem"("listId", "priority");
