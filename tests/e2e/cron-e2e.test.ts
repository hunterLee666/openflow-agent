import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CronScheduler } from "../../src/scheduler/cron-scheduler.js";
import { createCronTools } from "../../src/tools/cron-tools.js";
import { createLoopCommand } from "../../src/commands/loop-command.js";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-e2e-test-${Date.now()}`);

function createTestScheduler(): CronScheduler {
  return new CronScheduler({
    dataDir: TEST_DIR,
    tickIntervalMs: 100,
    maxHistory: 100,
    defaultExpiresAfterDays: 3,
  });
}

describe("E2E - 完整用户场景", () => {
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

  it("场景：用户创建周期性备份任务并管理", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    const listTool = tools.find((t) => t.name === "CronList");
    const pauseTool = tools.find((t) => t.name === "CronPause");
    const runTool = tools.find((t) => t.name === "CronRunNow");
    const historyTool = tools.find((t) => t.name === "CronHistory");
    const statsTool = tools.find((t) => t.name === "CronStats");

    const createResult = await createTool!.handler({
      label: "daily-backup",
      prompt: "Run database backup and verify integrity",
      cron: "0 2 * * *",
      mode: "isolated",
      maxRuns: 30,
      expiresAfter: "30d",
    });
    expect(createResult).toContain("Cron job created successfully");

    const listResult = await listTool!.handler({ status: "all" });
    expect(listResult).toContain("daily-backup");

    const pauseResult = await pauseTool!.handler({
      jobId: createResult.match(/ID: (cron_\S+)/)?.[1]!,
    });
    expect(pauseResult).toContain("paused");

    const runResult = await runTool!.handler({
      jobId: createResult.match(/ID: (cron_\S+)/)?.[1]!,
    });
    expect(runResult).toContain("executed");

    const historyResult = await historyTool!.handler({
      jobId: createResult.match(/ID: (cron_\S+)/)?.[1]!,
    });
    expect(historyResult).toContain("Execution History");

    const statsResult = await statsTool!.handler({});
    expect(statsResult).toContain("Total jobs: 1");
  });

  it("场景：用户创建带技能绑定的代码审查任务", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    const statusTool = tools.find((t) => t.name === "CronStatus");
    const editTool = tools.find((t) => t.name === "CronEdit");

    const createResult = await createTool!.handler({
      label: "code-review",
      prompt: "Review all pending pull requests",
      cron: "0 */4 * * *",
      boundSkills: ["code_review", "security_audit"],
    });
    expect(createResult).toContain("Bound skills: code_review, security_audit");

    const jobId = createResult.match(/ID: (cron_\S+)/)?.[1]!;

    const statusResult = await statusTool!.handler({ jobId });
    expect(statusResult).toContain("code-review");
    expect(statusResult).toContain("Bound skills: code_review, security_audit");

    const editResult = await editTool!.handler({
      jobId,
      boundSkills: ["code_review", "security_audit", "performance_audit"],
    });
    expect(editResult).toContain("updated");

    const updatedStatus = await statusTool!.handler({ jobId });
    expect(updatedStatus).toContain("performance_audit");
  });

  it("场景：用户创建带工作流绑定的部署任务", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    const statusTool = tools.find((t) => t.name === "CronStatus");

    const createResult = await createTool!.handler({
      label: "deploy-staging",
      prompt: "Deploy latest build to staging environment",
      cron: "0 9 * * 1-5",
      boundWorkflows: ["build", "test", "deploy"],
    });
    expect(createResult).toContain("Bound workflows: build, test, deploy");

    const jobId = createResult.match(/ID: (cron_\S+)/)?.[1]!;

    const statusResult = await statusTool!.handler({ jobId });
    expect(statusResult).toContain("deploy-staging");
    expect(statusResult).toContain("Bound workflows: build, test, deploy");
  });

  it("场景：用户创建一次性定时报告任务", async () => {
    const loopCmdHandler = loopCmd.handler;

    const futureDate = new Date(Date.now() + 7200000).toISOString();
    const createResult = await loopCmdHandler(`once ${futureDate} generate monthly report`);
    expect(createResult).toContain("once");
    expect(createResult).toContain("generate monthly report");

    const jobId = createResult.match(/ID: (cron_\S+)/)?.[1]!;

    const job = scheduler.getJob(jobId);
    expect(job?.type).toBe("once");
    expect(job?.maxRuns).toBe(1);

    const runResult = await loopCmdHandler(`run ${jobId}`);
    expect(runResult).toContain("executed");

    const completedJob = scheduler.getJob(jobId);
    expect(completedJob?.status).toBe("completed");
  });

  it("场景：用户管理多个任务并查看统计", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");
    const listTool = tools.find((t) => t.name === "CronList");
    const statsTool = tools.find((t) => t.name === "CronStats");

    await createTool!.handler({
      label: "task-1",
      prompt: "test",
      cron: "*/5 * * * *",
    });

    await createTool!.handler({
      label: "task-2",
      prompt: "test",
      cron: "*/10 * * * *",
    });

    const task3Result = await createTool!.handler({
      label: "task-3",
      prompt: "test",
      cron: "*/15 * * * *",
    });
    const task3Id = task3Result.match(/ID: (cron_\S+)/)?.[1]!;

    const pauseTool = tools.find((t) => t.name === "CronPause");
    await pauseTool!.handler({ jobId: task3Id });

    const listResult = await listTool!.handler({ status: "all" });
    expect(listResult).toContain("task-1");
    expect(listResult).toContain("task-2");
    expect(listResult).toContain("task-3");

    const activeListResult = await listTool!.handler({ status: "active" });
    expect(activeListResult).toContain("task-1");
    expect(activeListResult).toContain("task-2");

    const pausedListResult = await listTool!.handler({ status: "paused" });
    expect(pausedListResult).toContain("task-3");

    const statsResult = await statsTool!.handler({});
    expect(statsResult).toContain("Total jobs: 3");
    expect(statsResult).toContain("pausedJobs: 1");
  });
});

describe("E2E - 持久化与重启场景", () => {
  it("场景：系统重启后任务不丢失", async () => {
    await mkdir(TEST_DIR, { recursive: true });

    const scheduler1 = createTestScheduler();
    await scheduler1.initialize();

    const tools1 = createCronTools(scheduler1);
    const createTool = tools1.find((t) => t.name === "CronCreate");

    await createTool!.handler({
      label: "critical-task",
      prompt: "Monitor system health",
      cron: "*/5 * * * *",
      boundSkills: ["health_check"],
      boundWorkflows: ["alert"],
    });

    await scheduler1.shutdown();

    const scheduler2 = createTestScheduler();
    await scheduler2.initialize();

    const tools2 = createCronTools(scheduler2);
    const listTool = tools2.find((t) => t.name === "CronList");

    const listResult = await listTool!.handler({ status: "all" });
    expect(listResult).toContain("critical-task");
    expect(listResult).toContain("health_check");
    expect(listResult).toContain("alert");

    const jobs = scheduler2.getAllJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].boundSkills).toEqual(["health_check"]);
    expect(jobs[0].boundWorkflows).toEqual(["alert"]);

    await scheduler2.shutdown();
    await rm(TEST_DIR, { recursive: true, force: true });
  });
});

describe("E2E - 错误处理场景", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    await scheduler.initialize();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await scheduler.shutdown();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("场景：用户尝试操作不存在的任务", async () => {
    const pauseTool = tools.find((t) => t.name === "CronPause");
    const resumeTool = tools.find((t) => t.name === "CronResume");
    const deleteTool = tools.find((t) => t.name === "CronDelete");
    const runTool = tools.find((t) => t.name === "CronRunNow");
    const statusTool = tools.find((t) => t.name === "CronStatus");

    expect(await pauseTool!.handler({ jobId: "nonexistent" })).toContain("Error");
    expect(await resumeTool!.handler({ jobId: "nonexistent" })).toContain("Error");
    expect(await deleteTool!.handler({ jobId: "nonexistent" })).toContain("Error");
    expect(await runTool!.handler({ jobId: "nonexistent" })).toContain("Error");
    expect(await statusTool!.handler({ jobId: "nonexistent" })).toContain("Error");
  });

  it("场景：用户提供无效的 cron 表达式", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");

    const result = await createTool!.handler({
      label: "invalid-cron",
      prompt: "test",
      cron: "invalid",
    });

    expect(result).toBeDefined();
  });

  it("场景：用户提供无效的 interval 格式", async () => {
    const createTool = tools.find((t) => t.name === "CronCreate");

    const result = await createTool!.handler({
      label: "invalid-interval",
      prompt: "test",
      interval: "abc",
    });

    expect(result).toContain("Error");
    expect(result).toContain("Invalid interval format");
  });
});
