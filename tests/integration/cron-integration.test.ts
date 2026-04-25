import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CronScheduler } from "../../refactored/core/scheduler/cron-scheduler.js";
import { createCronTools } from "../../refactored/core/tools/cron-tools.js";
import { createLoopCommand } from "../../refactored/core/commands/loop-command.js";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-integration-test-${Date.now()}`);

function createTestScheduler(): CronScheduler {
  return new CronScheduler({
    dataDir: TEST_DIR,
    tickIntervalMs: 100,
    maxHistory: 100,
    defaultExpiresAfterDays: 3,
  });
}

describe("集成测试 - 完整工作流", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;
  let loopCmd: ReturnType<typeof createLoopCommand>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    await scheduler.initialize();
    tools = createCronTools(scheduler);
    loopCmd = createLoopCommand(scheduler);
  });

  afterEach(async () => {
    await scheduler.shutdown();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能创建、暂停、恢复、执行、删除任务", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    const pauseTool = tools.find((t) => t.name === "CronPause");
    const resumeTool = tools.find((t) => t.name === "CronResume");
    const runTool = tools.find((t) => t.name === "CronRunNow");
    const deleteTool = tools.find((t) => t.name === "CronDelete");

    const createResult = await createTool!.handler({
      label: "integration-test",
      prompt: "test prompt",
      cron: "*/5 * * * *",
      boundSkills: ["skill1"],
      boundWorkflows: ["workflow1"],
    });
    expect(createResult).toContain("Cron job created successfully");

    const jobId = createResult.match(/ID: (cron_\S+)/)?.[1];
    expect(jobId).toBeDefined();

    const pauseResult = await pauseTool!.handler({ jobId });
    expect(pauseResult).toContain("paused");

    const resumeResult = await resumeTool!.handler({ jobId });
    expect(resumeResult).toContain("resumed");

    const runResult = await runTool!.handler({ jobId });
    expect(runResult).toContain("executed");

    const deleteResult = await deleteTool!.handler({ jobId });
    expect(deleteResult).toContain("deleted");
  });

  it("应该能通过自然语言创建任务并管理", async () => {
    const createResult = await loopCmd.handler("every 10 minutes check system");
    expect(createResult).toContain("Cron job created successfully");

    const jobId = createResult.match(/ID: (cron_\S+)/)?.[1];
    expect(jobId).toBeDefined();

    const statusResult = await loopCmd.handler(`status ${jobId}`);
    expect(statusResult).toContain("check system");

    const pauseResult = await loopCmd.handler(`pause ${jobId}`);
    expect(pauseResult).toContain("paused");
  });

  it("应该能创建一次性任务并执行", async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const createResult = await loopCmd.handler(`once ${futureDate} send notification`);
    expect(createResult).toContain("once");

    const jobId = createResult.match(/ID: (cron_\S+)/)?.[1];
    expect(jobId).toBeDefined();

    const runResult = await loopCmd.handler(`run ${jobId}`);
    expect(runResult).toContain("executed");

    const job = scheduler.getJob(jobId);
    expect(job?.status).toBe("completed");
  });

  it("应该能创建带绑定的任务并验证", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    const statusTool = tools.find((t) => t.name === "CronStatus");

    const createResult = await createTool!.handler({
      label: "bound-task",
      prompt: "test",
      cron: "*/5 * * * *",
      boundSkills: ["code_review", "test_generator"],
      boundWorkflows: ["deploy", "build"],
    });

    const jobId = createResult.match(/ID: (cron_\S+)/)?.[1];
    expect(jobId).toBeDefined();

    const statusResult = await statusTool!.handler({ jobId });
    expect(statusResult).toContain("Bound skills: code_review, test_generator");
    expect(statusResult).toContain("Bound workflows: deploy, build");
  });
});

describe("集成测试 - 持久化验证", () => {
  it("应该在重启后保留任务", async () => {
    await mkdir(TEST_DIR, { recursive: true });

    const scheduler1 = createTestScheduler();
    await scheduler1.initialize();

    scheduler1.createJob({
      label: "persistent-task",
      prompt: "test",
      cronExpression: "*/5 * * * *",
      boundSkills: ["skill1"],
      boundWorkflows: ["workflow1"],
    });

    await scheduler1.shutdown();

    const scheduler2 = createTestScheduler();
    await scheduler2.initialize();

    const jobs = scheduler2.getAllJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].label).toBe("persistent-task");
    expect(jobs[0].boundSkills).toEqual(["skill1"]);
    expect(jobs[0].boundWorkflows).toEqual(["workflow1"]);

    await scheduler2.shutdown();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该在重启后保留任务状态", async () => {
    await mkdir(TEST_DIR, { recursive: true });

    const scheduler1 = createTestScheduler();
    await scheduler1.initialize();

    const job = scheduler1.createJob({
      label: "status-test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    scheduler1.pauseJob(job.id);
    await scheduler1.shutdown();

    const scheduler2 = createTestScheduler();
    await scheduler2.initialize();

    const jobs = scheduler2.getAllJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].status).toBe("paused");

    await scheduler2.shutdown();
    await rm(TEST_DIR, { recursive: true, force: true });
  });
});

describe("集成测试 - 执行历史", () => {
  let scheduler: CronScheduler;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    await scheduler.initialize();
  });

  afterEach(async () => {
    await scheduler.shutdown();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能记录多次执行历史", async () => {
    const job = scheduler.createJob({
      label: "history-test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    await scheduler.runJobNow(job.id);
    await scheduler.runJobNow(job.id);
    await scheduler.runJobNow(job.id);

    const history = await scheduler.getJobHistory(job.id);
    expect(history.length).toBe(3);
    expect(history.every((h) => h.success)).toBe(true);
  });

  it("应该能记录失败的历史", async () => {
    const job = scheduler.createJob({
      label: "fail-history",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const mockExecutor = async (job) => ({
      jobId: job.id,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 100,
      success: false,
      output: "",
      error: "test error",
    });

    await scheduler.runJobNow(job.id, mockExecutor);

    const history = await scheduler.getJobHistory(job.id);
    expect(history.length).toBe(1);
    expect(history[0].success).toBe(false);
    expect(history[0].error).toBe("test error");
  });
});

describe("集成测试 - 事件系统", () => {
  let scheduler: CronScheduler;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    await scheduler.initialize();
  });

  afterEach(async () => {
    await scheduler.shutdown();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该在完整生命周期中触发所有事件", async () => {
    const events: string[] = [];

    scheduler.on("job:created", () => events.push("created"));
    scheduler.on("job:paused", () => events.push("paused"));
    scheduler.on("job:resumed", () => events.push("resumed"));
    scheduler.on("job:updated", () => events.push("updated"));
    scheduler.on("job:start", () => events.push("start"));
    scheduler.on("job:complete", () => events.push("complete"));
    scheduler.on("job:deleted", () => events.push("deleted"));

    const job = scheduler.createJob({
      label: "event-lifecycle",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    scheduler.pauseJob(job.id);
    scheduler.resumeJob(job.id);
    scheduler.editJob(job.id, { label: "updated-label" });
    await scheduler.runJobNow(job.id);
    scheduler.deleteJob(job.id);

    expect(events).toContain("created");
    expect(events).toContain("paused");
    expect(events).toContain("resumed");
    expect(events).toContain("updated");
    expect(events).toContain("start");
    expect(events).toContain("complete");
    expect(events).toContain("deleted");
  });
});
