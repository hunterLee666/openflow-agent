import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createCronTools } from "../../refactored/core/tools/cron-tools.js";
import { CronScheduler } from "../../refactored/core/scheduler/cron-scheduler.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-cron-tools-test-${Date.now()}`);

function createTestScheduler(): CronScheduler {
  return new CronScheduler({
    dataDir: TEST_DIR,
    tickIntervalMs: 100,
    maxHistory: 100,
    defaultExpiresAfterDays: 3,
  });
}

describe("Cron Tools - 工具创建", () => {
  it("应该创建 10 个工具", () => {
    const scheduler = new CronScheduler({ dataDir: TEST_DIR });
    const tools = createCronTools(scheduler);
    expect(tools.length).toBe(10);
  });

  it("应该包含所有预期的工具名称", () => {
    const scheduler = new CronScheduler({ dataDir: TEST_DIR });
    const tools = createCronTools(scheduler);
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain("CronCreate");
    expect(toolNames).toContain("CronList");
    expect(toolNames).toContain("CronDelete");
    expect(toolNames).toContain("CronPause");
    expect(toolNames).toContain("CronResume");
    expect(toolNames).toContain("CronRunNow");
    expect(toolNames).toContain("CronStatus");
    expect(toolNames).toContain("CronHistory");
    expect(toolNames).toContain("CronEdit");
    expect(toolNames).toContain("CronStats");
  });
});

describe("CronCreate Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能通过 cron 表达式创建任务", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    expect(createTool).toBeDefined();

    const result = await createTool!.handler({
      label: "test-cron",
      prompt: "test prompt",
      cron: "*/5 * * * *",
    });

    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("test-cron");
    expect(result).toContain("recurring");
  });

  it("应该能通过 interval 创建任务", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    expect(createTool).toBeDefined();

    const result = await createTool!.handler({
      label: "test-interval",
      prompt: "test prompt",
      interval: "5m",
    });

    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("test-interval");
  });

  it("应该能通过 runAt 创建一次性任务", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    expect(createTool).toBeDefined();

    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const result = await createTool!.handler({
      label: "test-once",
      prompt: "one-time task",
      runAt: futureDate,
    });

    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("once");
  });

  it("应该能绑定技能", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    expect(createTool).toBeDefined();

    const result = await createTool!.handler({
      label: "with-skills",
      prompt: "test",
      cron: "*/5 * * * *",
      boundSkills: ["code_review", "test_generator"],
    });

    expect(result).toContain("Bound skills: code_review, test_generator");
  });

  it("应该能绑定工作流", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    expect(createTool).toBeDefined();

    const result = await createTool!.handler({
      label: "with-workflows",
      prompt: "test",
      cron: "*/5 * * * *",
      boundWorkflows: ["deploy", "build"],
    });

    expect(result).toContain("Bound workflows: deploy, build");
  });

  it("应该在缺少必要参数时返回错误", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    expect(createTool).toBeDefined();

    const result = await createTool!.handler({
      label: "test",
      prompt: "test",
    });

    expect(result).toContain("Error");
    expect(result).toContain("cron");
    expect(result).toContain("interval");
    expect(result).toContain("runAt");
  });

  it("应该在 runAt 格式无效时返回错误", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    expect(createTool).toBeDefined();

    const result = await createTool!.handler({
      label: "test",
      prompt: "test",
      runAt: "invalid-date",
    });

    expect(result).toContain("Error");
    expect(result).toContain("Invalid runAt format");
  });

  it("应该在 interval 格式无效时返回错误", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    expect(createTool).toBeDefined();

    const result = await createTool!.handler({
      label: "test",
      prompt: "test",
      interval: "invalid",
    });

    expect(result).toContain("Error");
    expect(result).toContain("Invalid interval format");
  });
});

describe("CronList Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能列出所有任务", async () => {
    scheduler.createJob({ label: "job1", prompt: "test", cronExpression: "*/5 * * * *" });
    scheduler.createJob({ label: "job2", prompt: "test", cronExpression: "*/10 * * * *" });

    const listTool = tools.find((t) => t.name === "CronList");
    expect(listTool).toBeDefined();

    const result = await listTool!.handler({ status: "all" });
    expect(result).toContain("job1");
    expect(result).toContain("job2");
  });

  it("应该能在没有任务时返回提示", async () => {
    const listTool = tools.find((t) => t.name === "CronList");
    expect(listTool).toBeDefined();

    const result = await listTool!.handler({ status: "all" });
    expect(result).toContain("No cron jobs found");
  });

  it("应该能按状态过滤", async () => {
    scheduler.createJob({ label: "active", prompt: "test", cronExpression: "*/5 * * * *" });
    const pausedJob = scheduler.createJob({ label: "paused", prompt: "test", cronExpression: "*/10 * * * *" });
    scheduler.pauseJob(pausedJob.id);

    const listTool = tools.find((t) => t.name === "CronList");
    expect(listTool).toBeDefined();

    const pausedResult = await listTool!.handler({ status: "paused" });
    expect(pausedResult).toContain("paused");
    expect(pausedResult).not.toContain("active");
  });
});

describe("CronDelete Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能删除任务", async () => {
    const job = scheduler.createJob({ label: "to-delete", prompt: "test", cronExpression: "*/5 * * * *" });

    const deleteTool = tools.find((t) => t.name === "CronDelete");
    expect(deleteTool).toBeDefined();

    const result = await deleteTool!.handler({ jobId: job.id });
    expect(result).toContain("deleted");

    expect(scheduler.getJob(job.id)).toBeUndefined();
  });

  it("应该在任务不存在时返回错误", async () => {
    const deleteTool = tools.find((t) => t.name === "CronDelete");
    expect(deleteTool).toBeDefined();

    const result = await deleteTool!.handler({ jobId: "nonexistent" });
    expect(result).toContain("Error");
    expect(result).toContain("not found");
  });
});

describe("CronPause Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能暂停任务", async () => {
    const job = scheduler.createJob({ label: "to-pause", prompt: "test", cronExpression: "*/5 * * * *" });

    const pauseTool = tools.find((t) => t.name === "CronPause");
    expect(pauseTool).toBeDefined();

    const result = await pauseTool!.handler({ jobId: job.id });
    expect(result).toContain("paused");

    const updated = scheduler.getJob(job.id);
    expect(updated?.status).toBe("paused");
  });

  it("应该在任务不存在时返回错误", async () => {
    const pauseTool = tools.find((t) => t.name === "CronPause");
    expect(pauseTool).toBeDefined();

    const result = await pauseTool!.handler({ jobId: "nonexistent" });
    expect(result).toContain("Error");
  });
});

describe("CronResume Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能恢复任务", async () => {
    const job = scheduler.createJob({ label: "to-resume", prompt: "test", cronExpression: "*/5 * * * *" });
    scheduler.pauseJob(job.id);

    const resumeTool = tools.find((t) => t.name === "CronResume");
    expect(resumeTool).toBeDefined();

    const result = await resumeTool!.handler({ jobId: job.id });
    expect(result).toContain("resumed");

    const updated = scheduler.getJob(job.id);
    expect(updated?.status).toBe("pending");
  });

  it("应该在任务不存在时返回错误", async () => {
    const resumeTool = tools.find((t) => t.name === "CronResume");
    expect(resumeTool).toBeDefined();

    const result = await resumeTool!.handler({ jobId: "nonexistent" });
    expect(result).toContain("Error");
  });
});

describe("CronRunNow Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能立即执行任务", async () => {
    const job = scheduler.createJob({ label: "run-now", prompt: "test prompt", cronExpression: "*/5 * * * *" });

    const runTool = tools.find((t) => t.name === "CronRunNow");
    expect(runTool).toBeDefined();

    const result = await runTool!.handler({ jobId: job.id });
    expect(result).toContain("executed");
  });

  it("应该在任务不存在时返回错误", async () => {
    const runTool = tools.find((t) => t.name === "CronRunNow");
    expect(runTool).toBeDefined();

    const result = await runTool!.handler({ jobId: "nonexistent" });
    expect(result).toContain("Error");
  });
});

describe("CronStatus Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能获取任务详情", async () => {
    const job = scheduler.createJob({
      label: "status-test",
      prompt: "test prompt",
      cronExpression: "*/5 * * * *",
      boundSkills: ["skill1"],
      boundWorkflows: ["workflow1"],
    });

    const statusTool = tools.find((t) => t.name === "CronStatus");
    expect(statusTool).toBeDefined();

    const result = await statusTool!.handler({ jobId: job.id });
    expect(result).toContain("status-test");
    expect(result).toContain("recurring");
    expect(result).toContain("Bound skills: skill1");
    expect(result).toContain("Bound workflows: workflow1");
  });

  it("应该在任务不存在时返回错误", async () => {
    const statusTool = tools.find((t) => t.name === "CronStatus");
    expect(statusTool).toBeDefined();

    const result = await statusTool!.handler({ jobId: "nonexistent" });
    expect(result).toContain("Error");
  });
});

describe("CronHistory Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能获取执行历史", async () => {
    const job = scheduler.createJob({ label: "history-test", prompt: "test", cronExpression: "*/5 * * * *" });
    await scheduler.runJobNow(job.id);
    await scheduler.runJobNow(job.id);

    const historyTool = tools.find((t) => t.name === "CronHistory");
    expect(historyTool).toBeDefined();

    const result = await historyTool!.handler({ jobId: job.id });
    expect(result).toContain("Execution History");
  });

  it("应该在没有历史时返回提示", async () => {
    const job = scheduler.createJob({ label: "no-history", prompt: "test", cronExpression: "*/5 * * * *" });

    const historyTool = tools.find((t) => t.name === "CronHistory");
    expect(historyTool).toBeDefined();

    const result = await historyTool!.handler({ jobId: job.id });
    expect(result).toContain("No execution history");
  });
});

describe("CronEdit Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能编辑任务标签", async () => {
    const job = scheduler.createJob({ label: "old-label", prompt: "test", cronExpression: "*/5 * * * *" });

    const editTool = tools.find((t) => t.name === "CronEdit");
    expect(editTool).toBeDefined();

    const result = await editTool!.handler({ jobId: job.id, label: "new-label" });
    expect(result).toContain("updated");

    const updated = scheduler.getJob(job.id);
    expect(updated?.label).toBe("new-label");
  });

  it("应该能编辑绑定的技能", async () => {
    const job = scheduler.createJob({ label: "test", prompt: "test", cronExpression: "*/5 * * * *" });

    const editTool = tools.find((t) => t.name === "CronEdit");
    expect(editTool).toBeDefined();

    await editTool!.handler({ jobId: job.id, boundSkills: ["skill1", "skill2"] });

    const updated = scheduler.getJob(job.id);
    expect(updated?.boundSkills).toEqual(["skill1", "skill2"]);
  });

  it("应该能编辑绑定的工作流", async () => {
    const job = scheduler.createJob({ label: "test", prompt: "test", cronExpression: "*/5 * * * *" });

    const editTool = tools.find((t) => t.name === "CronEdit");
    expect(editTool).toBeDefined();

    await editTool!.handler({ jobId: job.id, boundWorkflows: ["workflow1"] });

    const updated = scheduler.getJob(job.id);
    expect(updated?.boundWorkflows).toEqual(["workflow1"]);
  });

  it("应该在任务不存在时返回错误", async () => {
    const editTool = tools.find((t) => t.name === "CronEdit");
    expect(editTool).toBeDefined();

    const result = await editTool!.handler({ jobId: "nonexistent", label: "new" });
    expect(result).toContain("Error");
  });
});

describe("CronStats Tool", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能获取统计信息", async () => {
    scheduler.createJob({ label: "job1", prompt: "test", cronExpression: "*/5 * * * *" });
    scheduler.createJob({ label: "job2", prompt: "test", cronExpression: "*/10 * * * *" });

    const statsTool = tools.find((t) => t.name === "CronStats");
    expect(statsTool).toBeDefined();

    const result = await statsTool!.handler({});
    expect(result).toContain("Total jobs: 2");
  });
});
