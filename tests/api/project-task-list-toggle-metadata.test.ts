import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { PATCH as projectPatch } from "../../src/app/api/projects/[projectId]/route";
import { GET as projectTreeGet } from "../../src/app/api/projects/tree/route";
import { prisma } from "../../src/lib/prisma";

interface ProjectTreeRow {
  id: string;
  mainPageSubprojectsVisible: boolean;
  mainPageTasksVisible: boolean;
}

async function resetDatabase(): Promise<void> {
  await prisma.taskStatusUpdate.deleteMany();
  await prisma.taskResponse.deleteMany();
  await prisma.taskExecution.deleteMany();
  await prisma.immediateAction.deleteMany();
  await prisma.task.deleteMany();
  await prisma.subproject.deleteMany();
  await prisma.project.deleteMany();
}

test.after(async () => {
  await resetDatabase();
});

test("project main page visibility toggles persist as project fields", async () => {
  await resetDatabase();

  const project = await prisma.project.create({
    data: {
      mainPageSubprojectsVisible: true,
      mainPageTasksVisible: true,
      name: "Metadata Toggle Project",
      path: "/tmp",
      priority: 0,
    },
    select: { id: true },
  });

  const patchResponse = await projectPatch(
    new Request(`http://localhost/api/projects/${project.id}`, {
      body: JSON.stringify({
        mainPageSubprojectsVisible: false,
        mainPageTasksVisible: false,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    }),
    { params: Promise.resolve({ projectId: project.id }) },
  );

  assert.equal(patchResponse.status, 200);

  const treeResponse = await projectTreeGet();
  assert.equal(treeResponse.status, 200);
  const rows = (await treeResponse.json()) as ProjectTreeRow[];
  const row = rows.find((item) => item.id === project.id);
  assert.ok(row);
  assert.equal(row.mainPageSubprojectsVisible, false);
  assert.equal(row.mainPageTasksVisible, false);
});
