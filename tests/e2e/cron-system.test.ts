import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CronScheduler, createCronScheduler } from "../../backend/scheduler/cron-scheduler.js";
import { createCronTools } from "../../backend/tools/cron-tools.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-cron-e2e-${Date.now()}`);

describe("E2E - Cron 定时任务系统完整场景", () => {
  let scheduler: CronScheduler;
  let tools: ReturnType<typeof createCronTools>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createCronScheduler({
      dataDir: TEST_DIR,
      tickIntervalMs: 100,
    });
    await scheduler.initialize();
    tools = createCronTools(scheduler);
  });

  afterEach(async () => {
    await scheduler.shutdown();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: 用户创建周期性备份任务并管理", () => {
    it("应该能够创建每小时执行的备份任务", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      
      const result = await createTool!.handler({
        label: "hourly-backup",
        prompt: "Backup database and upload to cloud storage",
        cron: "0 * * * *",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("hourly-backup");
      expect(result.message).toContain("recurring");
      expect(result.message).toContain("0 * * * *");
    });

    it("应该能够使用自然语言间隔创建任务", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      
      const result = await createTool!.handler({
        label: "frequent-check",
        prompt: "Check system health",
        interval: "5m",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("frequent-check");
    });

    it("应该能够查看任务列表", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const listTool = tools.find((t) => t.name === "CronList");

      await createTool!.handler({
        label: "task-1",
        prompt: "First task",
        cron: "*/5 * * * *",
      });

      await createTool!.handler({
        label: "task-2",
        prompt: "Second task",
        cron: "*/10 * * * *",
      });

      const listResult = await listTool!.handler({ status: "all" });

      expect(listResult.success).toBe(true);
      expect(listResult.message).toContain("task-1");
      expect(listResult.message).toContain("task-2");
    });

    it("应该能够暂停和恢复任务", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const pauseTool = tools.find((t) => t.name === "CronPause");
      const resumeTool = tools.find((t) => t.name === "CronResume");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const createResult = await createTool!.handler({
        label: "pausable-task",
        prompt: "Test pause/resume",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];
      expect(jobId).toBeDefined();

      const pauseResult = await pauseTool!.handler({ jobId: jobId! });
      expect(pauseResult.success).toBe(true);

      const statusAfterPause = await statusTool!.handler({ jobId: jobId! });
      expect(statusAfterPause.message).toContain("已暂停");

      const resumeResult = await resumeTool!.handler({ jobId: jobId! });
      expect(resumeResult.success).toBe(true);

      const statusAfterResume = await statusTool!.handler({ jobId: jobId! });
      expect(statusAfterResume.message).toContain("等待中");
    });

    it("应该能够删除任务", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const deleteTool = tools.find((t) => t.name === "CronDelete");
      const listTool = tools.find((t) => t.name === "CronList");

      const createResult = await createTool!.handler({
        label: "deletable-task",
        prompt: "Test delete",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];
      expect(jobId).toBeDefined();

      const deleteResult = await deleteTool!.handler({ jobId: jobId! });
      expect(deleteResult.success).toBe(true);

      const listResult = await listTool!.handler({ status: "all" });
      expect(listResult.message).not.toContain("deletable-task");
    });
  });

  describe("场景 2: 用户创建带技能绑定的代码审查任务", () => {
    it("应该能够创建绑定技能的任务", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      
      const result = await createTool!.handler({
        label: "code-review",
        prompt: "Review all pending pull requests",
        cron: "0 */4 * * *",
        boundSkills: ["code_review", "security_audit"],
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("code_review");
      expect(result.message).toContain("security_audit");
    });

    it("应该能够在任务详情中查看绑定的技能", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const createResult = await createTool!.handler({
        label: "skill-bound-task",
        prompt: "Test with skills",
        cron: "*/10 * * * *",
        boundSkills: ["skill1", "skill2", "skill3"],
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];
      expect(jobId).toBeDefined();

      const statusResult = await statusTool!.handler({ jobId: jobId! });
      expect(statusResult.message).toContain("skill1");
      expect(statusResult.message).toContain("skill2");
      expect(statusResult.message).toContain("skill3");
    });
  });

  describe("场景 3: 用户创建带工作流绑定的部署任务", () => {
    it("应该能够创建绑定工作流的任务", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      
      const result = await createTool!.handler({
        label: "deploy-staging",
        prompt: "Deploy latest build to staging environment",
        cron: "0 9 * * 1-5",
        boundWorkflows: ["build", "test", "deploy"],
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("build");
      expect(result.message).toContain("test");
      expect(result.message).toContain("deploy");
    });

    it("应该能够同时绑定技能和工作流", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      
      const result = await createTool!.handler({
        label: "complex-task",
        prompt: "Complex workflow with skills",
        cron: "@daily",
        boundSkills: ["analysis"],
        boundWorkflows: ["report", "notify"],
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("analysis");
      expect(result.message).toContain("report");
      expect(result.message).toContain("notify");
    });
  });

  describe("场景 4: 用户创建一次性定时报告任务", () => {
    it("应该能够创建一次性任务", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      
      const futureDate = new Date(Date.now() + 7200000).toISOString();
      const result = await createTool!.handler({
        label: "one-time-report",
        prompt: "Generate monthly report",
        runAt: futureDate,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("once");
      expect(result.message).toContain("one-time-report");
    });

    it("一次性任务应该自动设置 maxRuns 为 1", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const createResult = await createTool!.handler({
        label: "single-run",
        prompt: "Run once",
        runAt: futureDate,
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];
      expect(jobId).toBeDefined();

      const statusResult = await statusTool!.handler({ jobId: jobId! });
      const job = scheduler.getJob(jobId!);
      expect(job?.maxRuns).toBe(1);
    });
  });

  describe("场景 5: 用户管理多个任务并查看统计", () => {
    it("应该能够创建多个任务并查看统计信息", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const statsTool = tools.find((t) => t.name === "CronStats");

      await createTool!.handler({
        label: "task-1",
        prompt: "First",
        cron: "*/5 * * * *",
      });

      await createTool!.handler({
        label: "task-2",
        prompt: "Second",
        cron: "*/10 * * * *",
      });

      await createTool!.handler({
        label: "task-3",
        prompt: "Third",
        cron: "*/15 * * * *",
      });

      const statsResult = await statsTool!.handler({});
      
      expect(statsResult.success).toBe(true);
      expect(statsResult.message).toContain("Total jobs: 3");
      expect(statsResult.message).toContain("Enabled jobs: 3");
    });

    it("应该能够按状态筛选任务", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const pauseTool = tools.find((t) => t.name === "CronPause");
      const listTool = tools.find((t) => t.name === "CronList");

      const result1 = await createTool!.handler({
        label: "active-task",
        prompt: "Active",
        cron: "*/5 * * * *",
      });

      const result2 = await createTool!.handler({
        label: "paused-task",
        prompt: "Paused",
        cron: "*/10 * * * *",
      });

      const jobId2 = result2.message.match(/ID: (cron_\S+)/)?.[1];
      await pauseTool!.handler({ jobId: jobId2! });

      const activeList = await listTool!.handler({ status: "active" });
      expect(activeList.message).toContain("active-task");
      expect(activeList.message).not.toContain("paused-task");

      const pausedList = await listTool!.handler({ status: "paused" });
      expect(pausedList.message).toContain("paused-task");
      expect(pausedList.message).not.toContain("active-task");
    });
  });

  describe("场景 6: 持久化与重启", () => {
    it("系统重启后任务应该保持", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      await createTool!.handler({
        label: "persistent-task",
        prompt: "Should survive restart",
        cron: "*/5 * * * *",
      });

      await scheduler.shutdown();

      const scheduler2 = createCronScheduler({
        dataDir: TEST_DIR,
        tickIntervalMs: 100,
      });
      await scheduler2.initialize();

      const tools2 = createCronTools(scheduler2);
      const listTool = tools2.find((t) => t.name === "CronList");

      const listResult = await listTool!.handler({ status: "all" });
      expect(listResult.message).toContain("persistent-task");

      await scheduler2.shutdown();
    });

    it("任务状态应该在重启后保持", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const pauseTool = tools.find((t) => t.name === "CronPause");

      const createResult = await createTool!.handler({
        label: "stateful-task",
        prompt: "Test state persistence",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];
      await pauseTool!.handler({ jobId: jobId! });

      await scheduler.shutdown();

      const scheduler2 = createCronScheduler({
        dataDir: TEST_DIR,
        tickIntervalMs: 100,
      });
      await scheduler2.initialize();

      const job = scheduler2.getJob(jobId!);
      expect(job?.status).toBe("paused");

      await scheduler2.shutdown();
    });
  });

  describe("场景 7: 立即执行任务", () => {
    it("应该能够立即执行任务", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const runNowTool = tools.find((t) => t.name === "CronRunNow");

      const createResult = await createTool!.handler({
        label: "run-immediately",
        prompt: "Test immediate execution",
        cron: "0 0 1 1 *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];
      expect(jobId).toBeDefined();

      const runResult = await runNowTool!.handler({ jobId: jobId! });
      expect(runResult.success).toBe(true);
      expect(runResult.message).toContain("executed immediately");
    });

    it("立即执行应该增加运行计数", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const runNowTool = tools.find((t) => t.name === "CronRunNow");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const createResult = await createTool!.handler({
        label: "count-test",
        prompt: "Test run count",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];

      await runNowTool!.handler({ jobId: jobId! });
      await runNowTool!.handler({ jobId: jobId! });
      await runNowTool!.handler({ jobId: jobId! });

      const statusResult = await statusTool!.handler({ jobId: jobId! });
      expect(statusResult.message).toContain("Total runs: 3");
    });
  });

  describe("场景 8: 错误处理", () => {
    it("应该能够处理不存在的任务操作", async () => {
      const pauseTool = tools.find((t) => t.name === "CronPause");
      const resumeTool = tools.find((t) => t.name === "CronResume");
      const deleteTool = tools.find((t) => t.name === "CronDelete");
      const runNowTool = tools.find((t) => t.name === "CronRunNow");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const result1 = await pauseTool!.handler({ jobId: "nonexistent" });
      expect(result1.success).toBe(false);
      expect(result1.message).toContain("Error");

      const result2 = await resumeTool!.handler({ jobId: "nonexistent" });
      expect(result2.success).toBe(false);

      const result3 = await deleteTool!.handler({ jobId: "nonexistent" });
      expect(result3.success).toBe(false);

      const result4 = await runNowTool!.handler({ jobId: "nonexistent" });
      expect(result4.success).toBe(false);

      const result5 = await statusTool!.handler({ jobId: "nonexistent" });
      expect(result5.success).toBe(false);
    });

    it("应该能够处理无效的 cron 表达式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "invalid-cron",
        prompt: "Test invalid cron",
        cron: "not-a-valid-cron",
      });

      expect(result.success).toBe(true);
    });

    it("应该能够处理无效的 interval 格式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "invalid-interval",
        prompt: "test",
        interval: "abc",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Error");
    });

    it("应该能够处理缺少必要参数的情况", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "no-schedule",
        prompt: "test",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Error");
    });

    it("应该能够处理无效的 runAt 格式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "invalid-runat",
        prompt: "test",
        runAt: "not-a-date",
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Error");
    });
  });

  describe("场景 9: 任务编辑", () => {
    it("应该能够编辑任务的标签", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const editTool = tools.find((t) => t.name === "CronEdit");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const createResult = await createTool!.handler({
        label: "old-label",
        prompt: "test",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];

      const editResult = await editTool!.handler({
        jobId: jobId!,
        label: "new-label",
      });

      expect(editResult.success).toBe(true);

      const statusResult = await statusTool!.handler({ jobId: jobId! });
      expect(statusResult.message).toContain("new-label");
    });

    it("应该能够编辑任务的提示", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const editTool = tools.find((t) => t.name === "CronEdit");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const createResult = await createTool!.handler({
        label: "edit-prompt-test",
        prompt: "old prompt",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];

      await editTool!.handler({
        jobId: jobId!,
        prompt: "new prompt content",
      });

      const statusResult = await statusTool!.handler({ jobId: jobId! });
      expect(statusResult.message).toContain("new prompt content");
    });

    it("应该能够编辑任务的 cron 表达式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const editTool = tools.find((t) => t.name === "CronEdit");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const createResult = await createTool!.handler({
        label: "edit-cron-test",
        prompt: "test",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];

      await editTool!.handler({
        jobId: jobId!,
        cron: "*/10 * * * *",
      });

      const statusResult = await statusTool!.handler({ jobId: jobId! });
      expect(statusResult.message).toContain("*/10 * * * *");
    });

    it("应该能够编辑绑定的技能和工作流", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const editTool = tools.find((t) => t.name === "CronEdit");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const createResult = await createTool!.handler({
        label: "edit-bindings",
        prompt: "test",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];

      await editTool!.handler({
        jobId: jobId!,
        boundSkills: ["new_skill"],
        boundWorkflows: ["new_workflow"],
      });

      const statusResult = await statusTool!.handler({ jobId: jobId! });
      expect(statusResult.message).toContain("new_skill");
      expect(statusResult.message).toContain("new_workflow");
    });
  });

  describe("场景 10: 执行历史", () => {
    it("应该能够查看任务的执行历史", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const runNowTool = tools.find((t) => t.name === "CronRunNow");
      const historyTool = tools.find((t) => t.name === "CronHistory");

      const createResult = await createTool!.handler({
        label: "history-test",
        prompt: "Test history",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];

      await runNowTool!.handler({ jobId: jobId! });
      await runNowTool!.handler({ jobId: jobId! });

      const historyResult = await historyTool!.handler({ jobId: jobId!, limit: 10 });
      expect(historyResult.success).toBe(true);
      expect(historyResult.message).toContain("Execution History");
    });

    it("新任务应该没有执行历史", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const historyTool = tools.find((t) => t.name === "CronHistory");

      const createResult = await createTool!.handler({
        label: "no-history",
        prompt: "No history yet",
        cron: "*/5 * * * *",
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];

      const historyResult = await historyTool!.handler({ jobId: jobId! });
      expect(historyResult.message).toContain("No execution history");
    });
  });

  describe("场景 11: 特殊 cron 表达式", () => {
    it("应该能够处理 @hourly 表达式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "hourly-task",
        prompt: "Run every hour",
        cron: "@hourly",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("每小时");
    });

    it("应该能够处理 @daily 表达式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "daily-task",
        prompt: "Run every day",
        cron: "@daily",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("每天");
    });

    it("应该能够处理 @weekly 表达式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "weekly-task",
        prompt: "Run every week",
        cron: "@weekly",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("每周");
    });

    it("应该能够处理 @monthly 表达式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "monthly-task",
        prompt: "Run every month",
        cron: "@monthly",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("每月");
    });
  });

  describe("场景 12: 任务过期与最大运行次数", () => {
    it("应该能够设置任务过期时间", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "expiring-task",
        prompt: "This task will expire",
        cron: "*/5 * * * *",
        expiresAfter: "7d",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Expires:");
    });

    it("应该能够设置最大运行次数", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");
      const statusTool = tools.find((t) => t.name === "CronStatus");

      const createResult = await createTool!.handler({
        label: "limited-runs",
        prompt: "Run only 5 times",
        cron: "*/5 * * * *",
        maxRuns: 5,
      });

      const jobId = createResult.message.match(/ID: (cron_\S+)/)?.[1];

      const statusResult = await statusTool!.handler({ jobId: jobId! });
      expect(statusResult.message).toContain("Max runs: 5");
    });
  });

  describe("场景 13: 执行模式", () => {
    it("应该能够设置 main-session 执行模式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "main-session-task",
        prompt: "Run in main session",
        cron: "*/5 * * * *",
        mode: "main-session",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("main-session");
    });

    it("应该能够设置 isolated 执行模式", async () => {
      const createTool = tools.find((t) => t.name === "CronCreate");

      const result = await createTool!.handler({
        label: "isolated-task",
        prompt: "Run in isolated mode",
        cron: "*/5 * * * *",
        mode: "isolated",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("isolated");
    });
  });
});
