import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../../src/lib/prisma";
import { POST as acknowledgeImmediateActionPost } from "../../src/app/api/daemon/actions/ack/route";
import { POST as registerImmediateActionPost } from "../../src/app/api/daemon/actions/register/route";
import { GET as daemonSettingsGet } from "../../src/app/api/daemon/settings/route";
import { POST as claimTasksPost } from "../../src/app/api/daemon/tasks/claim/route";
import { POST as taskStatusPost } from "../../src/app/api/daemon/tasks/status/route";
import { POST as taskActionPost } from "../../src/app/api/tasks/[taskId]/action/route";
import { GET as listTaskResponsesGet } from "../../src/app/api/tasks/[taskId]/responses/route";

async function resetDatabase(): Promise<void> {
  await prisma.setting.deleteMany();
  await prisma.taskStatusUpdate.deleteMany();
  await prisma.taskResponse.deleteMany();
  await prisma.taskExecution.deleteMany();
  await prisma.immediateAction.deleteMany();
  await prisma.task.deleteMany();
  await prisma.subproject.deleteMany();
  await prisma.project.deleteMany();
}

async function createProject(name: string): Promise<{ id: string }> {
  return prisma.project.create({
    data: {
      name,
      path: "/tmp",
      priority: 0,
    },
    select: { id: true },
  });
}

test.after(async () => {
  await resetDatabase();
});

test("daemon claim endpoint returns one task per scope and marks tasks in progress", async () => {
  await resetDatabase();

  const projectOne = await createProject("Project One");
  const projectTwo = await createProject("Project Two");
  const subOne = await prisma.subproject.create({
    data: {
      name: "Sub One",
      path: "/tmp/sub-one",
      priority: 0,
      projectId: projectOne.id,
    },
    select: { id: true },
  });

  const projectOneMainTaskOne = await prisma.task.create({
    data: {
      priority: 0,
      projectId: projectOne.id,
      text: "p1-main-1",
    },
    select: { id: true },
  });
  await prisma.task.create({
    data: {
      priority: 1,
      projectId: projectOne.id,
      text: "p1-main-2",
    },
  });
  const projectOneSubTask = await prisma.task.create({
    data: {
      priority: 2,
      projectId: projectOne.id,
      subprojectId: subOne.id,
      text: "p1-sub-1",
    },
    select: { id: true },
  });
  const projectTwoMainTask = await prisma.task.create({
    data: {
      priority: 3,
      projectId: projectTwo.id,
      text: "p2-main-1",
    },
    select: { id: true },
  });

  const response = await claimTasksPost(
    new Request("http://localhost/api/daemon/tasks/claim", {
      body: JSON.stringify({ limit: 4 }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as { tasks: Array<{ id: string }> };
  const claimedIds = payload.tasks.map((task) => task.id);

  assert.deepEqual(claimedIds, [
    projectOneMainTaskOne.id,
    projectOneSubTask.id,
    projectTwoMainTask.id,
  ]);

  const claimedTasks = await prisma.task.findMany({
    select: {
      editLocked: true,
      id: true,
      status: true,
    },
    where: {
      id: {
        in: claimedIds,
      },
    },
  });

  assert.equal(claimedTasks.every((task) => task.editLocked), true);
  assert.equal(claimedTasks.every((task) => task.status === "in_progress"), true);
});

test("daemon status endpoint is idempotent when idempotency key is reused", async () => {
  await resetDatabase();

  const project = await createProject("Status Project");
  const task = await prisma.task.create({
    data: {
      editLocked: true,
      projectId: project.id,
      status: "in_progress",
      text: "status task",
    },
    select: { id: true },
  });

  const requestBody = {
    fullResponse: "full daemon response",
    idempotencyKey: "status-key-1",
    status: "done",
    taskId: task.id,
  };

  const first = await taskStatusPost(
    new Request("http://localhost/api/daemon/tasks/status", {
      body: JSON.stringify(requestBody),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const second = await taskStatusPost(
    new Request("http://localhost/api/daemon/tasks/status", {
      body: JSON.stringify(requestBody),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const statusRows = await prisma.taskStatusUpdate.findMany({
    where: { idempotencyKey: "status-key-1" },
  });
  const responseRows = await prisma.taskResponse.findMany({ where: { taskId: task.id } });

  assert.equal(statusRows.length, 1);
  assert.equal(responseRows.length, 1);
});

test("task responses endpoint returns persisted full daemon responses", async () => {
  await resetDatabase();

  const project = await createProject("Response Project");
  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      status: "done",
      text: "response task",
    },
    select: { id: true },
  });

  await prisma.taskResponse.createMany({
    data: [
      { fullText: "first response", taskId: task.id },
      { fullText: "second response", taskId: task.id },
    ],
  });

  const response = await listTaskResponsesGet(
    new Request(`http://localhost/api/tasks/${task.id}/responses?limit=1`),
    { params: Promise.resolve({ taskId: task.id }) },
  );
  const payload = (await response.json()) as {
    responses: Array<{ fullText: string; taskId: string }>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.responses.length, 1);
  assert.equal(payload.responses[0].taskId, task.id);
});

test("task stop action endpoint creates one pending immediate action for running tasks", async () => {
  await resetDatabase();

  const project = await createProject("Stop Project");
  const task = await prisma.task.create({
    data: {
      editLocked: true,
      projectId: project.id,
      status: "in_progress",
      text: "running task",
    },
    select: { id: true },
  });

  const context = {
    params: Promise.resolve({ taskId: task.id }),
  };

  const first = await taskActionPost(
    new Request(`http://localhost/api/tasks/${task.id}/action`, {
      body: JSON.stringify({ action: "stop" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    context,
  );
  const second = await taskActionPost(
    new Request(`http://localhost/api/tasks/${task.id}/action`, {
      body: JSON.stringify({ action: "stop" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    context,
  );

  assert.equal(first.status, 204);
  assert.equal(second.status, 204);

  const actions = await prisma.immediateAction.findMany({
    where: {
      status: {
        in: ["pending", "acknowledged"],
      },
      taskId: task.id,
      type: "force_stop",
    },
  });

  const taskAfter = await prisma.task.findUnique({
    select: { status: true },
    where: { id: task.id },
  });

  assert.equal(actions.length, 1);
  assert.equal(taskAfter?.status, "in_progress");
});

test("immediate-action register and ack endpoints expose stable API contracts", async () => {
  await resetDatabase();

  const project = await createProject("Action Project");
  const task = await prisma.task.create({
    data: {
      projectId: project.id,
      text: "task",
    },
    select: { id: true },
  });

  const first = await registerImmediateActionPost(
    new Request("http://localhost/api/daemon/actions/register", {
      body: JSON.stringify({ taskId: task.id }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const firstPayload = (await first.json()) as { actionId: string; created: boolean };

  const second = await registerImmediateActionPost(
    new Request("http://localhost/api/daemon/actions/register", {
      body: JSON.stringify({ taskId: task.id }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const secondPayload = (await second.json()) as { actionId: string; created: boolean };

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(firstPayload.created, true);
  assert.equal(secondPayload.created, false);
  assert.equal(firstPayload.actionId, secondPayload.actionId);

  const ack = await acknowledgeImmediateActionPost(
    new Request("http://localhost/api/daemon/actions/ack", {
      body: JSON.stringify({ actionId: firstPayload.actionId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const ackPayload = (await ack.json()) as { acknowledged: boolean };

  assert.equal(ack.status, 200);
  assert.equal(ackPayload.acknowledged, true);
});

test("daemon settings endpoint returns revisioned settings snapshots", async () => {
  await resetDatabase();

  const first = await daemonSettingsGet(
    new Request("http://localhost/api/daemon/settings"),
  );
  assert.equal(first.status, 200);
  const firstPayload = (await first.json()) as {
    changed: boolean;
    revision: string;
    settings?: {
      daemon_max_parallel_tasks: string;
    };
  };

  assert.equal(firstPayload.changed, true);
  assert.equal(typeof firstPayload.revision, "string");
  assert.equal(typeof firstPayload.settings?.daemon_max_parallel_tasks, "string");

  const second = await daemonSettingsGet(
    new Request(`http://localhost/api/daemon/settings?revision=${firstPayload.revision}`),
  );
  assert.equal(second.status, 200);
  const secondPayload = (await second.json()) as {
    changed: boolean;
    revision: string;
    settings?: unknown;
  };
  assert.equal(secondPayload.changed, false);
  assert.equal(secondPayload.revision, firstPayload.revision);
  assert.equal(secondPayload.settings, undefined);

  await prisma.setting.upsert({
    create: {
      key: "daemon_max_parallel_tasks",
      value: "7",
    },
    update: {
      value: "7",
    },
    where: {
      key: "daemon_max_parallel_tasks",
    },
  });

  const third = await daemonSettingsGet(
    new Request(`http://localhost/api/daemon/settings?revision=${firstPayload.revision}`),
  );
  assert.equal(third.status, 200);
  const thirdPayload = (await third.json()) as {
    changed: boolean;
    revision: string;
    settings?: {
      daemon_max_parallel_tasks: string;
    };
  };

  assert.equal(thirdPayload.changed, true);
  assert.notEqual(thirdPayload.revision, firstPayload.revision);
  assert.equal(thirdPayload.settings?.daemon_max_parallel_tasks, "7");
});
