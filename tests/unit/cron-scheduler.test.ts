import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { CronScheduler } from "../../src/scheduler/cron-scheduler.js";
import { mkdir, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-cron-test-${Date.now()}`);

function createTestScheduler(overrides?: Record<string, unknown>): CronScheduler {
  return new CronScheduler({
    dataDir: TEST_DIR,
    tickIntervalMs: 100,
    maxHistory: 100,
    defaultExpiresAfterDays: 3,
    ...overrides,
  });
}

describe("CronScheduler - 初始化与生命周期", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该成功初始化调度器", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();
    expect(scheduler).toBeDefined();
    await scheduler.shutdown();
  });

  it("应该支持多次初始化（幂等）", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();
    await scheduler.initialize();
    await scheduler.initialize();
    await scheduler.shutdown();
  });

  it("应该在 shutdown 后停止调度器", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();
    await scheduler.shutdown();
    const stats = await scheduler.getStats();
    expect(stats.totalJobs).toBe(0);
  });

  it("应该创建持久化目录", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const jobsFile = join(TEST_DIR, "jobs.json");
    const historyDir = join(TEST_DIR, "history");

    await expect(stat(jobsFile)).resolves.toBeDefined();
    await expect(stat(historyDir)).resolves.toBeDefined();

    await scheduler.shutdown();
  });
});

describe("CronScheduler - 任务创建", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该创建周期性任务", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test-recurring",
      prompt: "run test",
      cronExpression: "*/5 * * * *",
    });

    expect(job.id).toBeDefined();
    expect(job.label).toBe("test-recurring");
    expect(job.type).toBe("recurring");
    expect(job.cronExpression).toBe("*/5 * * * *");
    expect(job.status).toBe("pending");
    expect(job.enabled).toBe(true);
    expect(job.runCount).toBe(0);
    expect(job.nextRunAt).toBeDefined();
  });

  it("应该创建一次性任务", () => {
    const scheduler = createTestScheduler();
    const futureTime = Date.now() + 60000;
    const job = scheduler.createJob({
      label: "test-once",
      prompt: "run once",
      runAt: futureTime,
      type: "once",
    });

    expect(job.type).toBe("once");
    expect(job.runAt).toBe(futureTime);
    expect(job.nextRunAt).toBe(futureTime);
    expect(job.maxRuns).toBe(1);
  });

  it("应该自动推断任务类型（有 runAt 时为 once）", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "auto-type",
      prompt: "test",
      runAt: Date.now() + 60000,
    });

    expect(job.type).toBe("once");
  });

  it("应该自动推断任务类型（有 cronExpression 时为 recurring）", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "auto-type",
      prompt: "test",
      cronExpression: "0 * * * *",
    });

    expect(job.type).toBe("recurring");
  });

  it("应该支持绑定技能", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "with-skills",
      prompt: "test",
      cronExpression: "*/10 * * * *",
      boundSkills: ["code_review", "test_generator"],
    });

    expect(job.boundSkills).toEqual(["code_review", "test_generator"]);
  });

  it("应该支持绑定工作流", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "with-workflows",
      prompt: "test",
      cronExpression: "*/10 * * * *",
      boundWorkflows: ["deploy", "build"],
    });

    expect(job.boundWorkflows).toEqual(["deploy", "build"]);
  });

  it("应该支持同时绑定技能和工作流", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "with-both",
      prompt: "test",
      cronExpression: "*/10 * * * *",
      boundSkills: ["skill1"],
      boundWorkflows: ["workflow1"],
    });

    expect(job.boundSkills).toEqual(["skill1"]);
    expect(job.boundWorkflows).toEqual(["workflow1"]);
  });

  it("应该支持自定义执行模式", () => {
    const scheduler = createTestScheduler();
    const mainJob = scheduler.createJob({
      label: "main-mode",
      prompt: "test",
      cronExpression: "*/5 * * * *",
      mode: "main-session",
    });

    const isolatedJob = scheduler.createJob({
      label: "isolated-mode",
      prompt: "test",
      cronExpression: "*/5 * * * *",
      mode: "isolated",
    });

    expect(mainJob.mode).toBe("main-session");
    expect(isolatedJob.mode).toBe("isolated");
  });

  it("应该支持设置最大运行次数", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "limited-runs",
      prompt: "test",
      cronExpression: "*/5 * * * *",
      maxRuns: 10,
    });

    expect(job.maxRuns).toBe(10);
  });

  it("应该支持设置过期时间", () => {
    const scheduler = createTestScheduler();
    const expiresAt = Date.now() + 86400000;
    const job = scheduler.createJob({
      label: "expiring",
      prompt: "test",
      cronExpression: "*/5 * * * *",
      expiresAt,
    });

    expect(job.expiresAt).toBe(expiresAt);
  });

  it("应该支持元数据", () => {
    const scheduler = createTestScheduler();
    const metadata = { createdBy: "user", priority: "high" };
    const job = scheduler.createJob({
      label: "with-metadata",
      prompt: "test",
      cronExpression: "*/5 * * * *",
      metadata,
    });

    expect(job.metadata).toEqual(metadata);
  });
});

describe("CronScheduler - 任务查询", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能通过 ID 获取任务", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "find-me",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const found = scheduler.getJob(job.id);
    expect(found).toBeDefined();
    expect(found?.label).toBe("find-me");
  });

  it("应该在任务不存在时返回 undefined", () => {
    const scheduler = createTestScheduler();
    const found = scheduler.getJob("nonexistent");
    expect(found).toBeUndefined();
  });

  it("应该能获取所有任务", () => {
    const scheduler = createTestScheduler();
    scheduler.createJob({ label: "job1", prompt: "test", cronExpression: "*/5 * * * *" });
    scheduler.createJob({ label: "job2", prompt: "test", cronExpression: "*/10 * * * *" });
    scheduler.createJob({ label: "job3", prompt: "test", cronExpression: "*/15 * * * *" });

    const allJobs = scheduler.getAllJobs();
    expect(allJobs.length).toBe(3);
  });

  it("应该能获取启用状态的任务", () => {
    const scheduler = createTestScheduler();
    scheduler.createJob({ label: "active1", prompt: "test", cronExpression: "*/5 * * * *" });
    scheduler.createJob({ label: "active2", prompt: "test", cronExpression: "*/10 * * * *" });

    const enabledJobs = scheduler.getEnabledJobs();
    expect(enabledJobs.length).toBe(2);
  });
});

describe("CronScheduler - 任务编辑", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能编辑任务标签", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "old-label",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const result = scheduler.editJob(job.id, { label: "new-label" });
    expect(result).toBe(true);

    const updated = scheduler.getJob(job.id);
    expect(updated?.label).toBe("new-label");
  });

  it("应该能编辑任务提示", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test",
      prompt: "old-prompt",
      cronExpression: "*/5 * * * *",
    });

    scheduler.editJob(job.id, { prompt: "new-prompt" });
    const updated = scheduler.getJob(job.id);
    expect(updated?.prompt).toBe("new-prompt");
  });

  it("应该能编辑 cron 表达式", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    scheduler.editJob(job.id, { cronExpression: "*/10 * * * *" });
    const updated = scheduler.getJob(job.id);
    expect(updated?.cronExpression).toBe("*/10 * * * *");
  });

  it("应该能编辑 runAt（转换为一次性任务）", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const newRunAt = Date.now() + 120000;
    scheduler.editJob(job.id, { runAt: newRunAt });
    const updated = scheduler.getJob(job.id);
    expect(updated?.type).toBe("once");
    expect(updated?.runAt).toBe(newRunAt);
  });

  it("应该能编辑绑定的技能", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    scheduler.editJob(job.id, { boundSkills: ["skill1", "skill2"] });
    const updated = scheduler.getJob(job.id);
    expect(updated?.boundSkills).toEqual(["skill1", "skill2"]);
  });

  it("应该能编辑绑定的工作流", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    scheduler.editJob(job.id, { boundWorkflows: ["workflow1"] });
    const updated = scheduler.getJob(job.id);
    expect(updated?.boundWorkflows).toEqual(["workflow1"]);
  });

  it("应该在任务不存在时返回 false", () => {
    const scheduler = createTestScheduler();
    const result = scheduler.editJob("nonexistent", { label: "new" });
    expect(result).toBe(false);
  });
});

describe("CronScheduler - 任务暂停与恢复", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能暂停任务", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const result = scheduler.pauseJob(job.id);
    expect(result).toBe(true);

    const paused = scheduler.getJob(job.id);
    expect(paused?.status).toBe("paused");
  });

  it("应该能恢复任务", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    scheduler.pauseJob(job.id);
    const result = scheduler.resumeJob(job.id);
    expect(result).toBe(true);

    const resumed = scheduler.getJob(job.id);
    expect(resumed?.status).toBe("pending");
  });

  it("应该在任务不存在时返回 false", () => {
    const scheduler = createTestScheduler();
    expect(scheduler.pauseJob("nonexistent")).toBe(false);
    expect(scheduler.resumeJob("nonexistent")).toBe(false);
  });
});

describe("CronScheduler - 任务删除", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能删除任务", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "to-delete",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const result = scheduler.deleteJob(job.id);
    expect(result).toBe(true);
    expect(scheduler.getJob(job.id)).toBeUndefined();
  });

  it("应该在任务不存在时返回 false", () => {
    const scheduler = createTestScheduler();
    const result = scheduler.deleteJob("nonexistent");
    expect(result).toBe(false);
  });
});

describe("CronScheduler - 任务启用与禁用", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能禁用任务", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const result = scheduler.disableJob(job.id);
    expect(result).toBe(true);

    const disabled = scheduler.getJob(job.id);
    expect(disabled?.enabled).toBe(false);
  });

  it("应该能启用已禁用的任务", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    scheduler.disableJob(job.id);
    const result = scheduler.enableJob(job.id);
    expect(result).toBe(true);

    const enabled = scheduler.getJob(job.id);
    expect(enabled?.enabled).toBe(true);
  });

  it("应该在任务不存在时返回 false", () => {
    const scheduler = createTestScheduler();
    expect(scheduler.enableJob("nonexistent")).toBe(false);
    expect(scheduler.disableJob("nonexistent")).toBe(false);
  });
});

describe("CronScheduler - 立即执行", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能立即执行任务", async () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "run-now",
      prompt: "test prompt",
      cronExpression: "*/5 * * * *",
    });

    const mockExecutor = mock(async (job) => ({
      jobId: job.id,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 100,
      success: true,
      output: `Executed: ${job.prompt}`,
    }));

    const result = await scheduler.runJobNow(job.id, mockExecutor);
    expect(result).toBeDefined();
    expect(result?.success).toBe(true);
    expect(result?.output).toContain("test prompt");

    const updated = scheduler.getJob(job.id);
    expect(updated?.runCount).toBe(1);
  });

  it("应该在任务不存在时返回 null", async () => {
    const scheduler = createTestScheduler();
    const mockExecutor = mock(async (job) => ({
      jobId: job.id,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 0,
      success: true,
      output: "ok",
    }));
    const result = await scheduler.runJobNow("nonexistent", mockExecutor);
    expect(result).toBeNull();
  });

  it("应该能处理执行失败", async () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "fail-test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const mockExecutor = mock(async (job) => ({
      jobId: job.id,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 100,
      success: false,
      output: "",
      error: "execution failed",
    }));

    const result = await scheduler.runJobNow(job.id, mockExecutor);
    expect(result?.success).toBe(false);
    expect(result?.error).toBe("execution failed");
  });
});

describe("CronScheduler - 持久化", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该在创建任务后持久化到磁盘", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    scheduler.createJob({
      label: "persistent-job",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    await scheduler.shutdown();

    const jobsFile = join(TEST_DIR, "jobs.json");
    const content = await readFile(jobsFile, "utf-8");
    const jobs = JSON.parse(content);

    expect(jobs.length).toBe(1);
    expect(jobs[0].label).toBe("persistent-job");
  });

  it("应该在初始化时加载持久化的任务", async () => {
    const scheduler1 = createTestScheduler();
    await scheduler1.initialize();

    scheduler1.createJob({
      label: "saved-job",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    await scheduler1.shutdown();

    const scheduler2 = createTestScheduler();
    await scheduler2.initialize();

    const jobs = scheduler2.getAllJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].label).toBe("saved-job");

    await scheduler2.shutdown();
  });

  it("应该在删除任务后更新持久化数据", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const job = scheduler.createJob({
      label: "to-delete",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    scheduler.deleteJob(job.id);
    await scheduler.shutdown();

    const jobsFile = join(TEST_DIR, "jobs.json");
    const content = await readFile(jobsFile, "utf-8");
    const jobs = JSON.parse(content);

    expect(jobs.length).toBe(0);
  });
});

describe("CronScheduler - 事件系统", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该在创建任务时触发事件", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const listener = mock(() => {});
    scheduler.on("job:created", listener);

    scheduler.createJob({
      label: "event-test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    expect(listener).toHaveBeenCalled();
    await scheduler.shutdown();
  });

  it("应该在删除任务时触发事件", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const job = scheduler.createJob({
      label: "event-test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const listener = mock(() => {});
    scheduler.on("job:deleted", listener);

    scheduler.deleteJob(job.id);

    expect(listener).toHaveBeenCalled();
    await scheduler.shutdown();
  });

  it("应该在更新任务时触发事件", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const job = scheduler.createJob({
      label: "event-test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const listener = mock(() => {});
    scheduler.on("job:updated", listener);

    scheduler.editJob(job.id, { label: "updated" });

    expect(listener).toHaveBeenCalled();
    await scheduler.shutdown();
  });

  it("应该在暂停任务时触发事件", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const job = scheduler.createJob({
      label: "event-test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const listener = mock(() => {});
    scheduler.on("job:paused", listener);

    scheduler.pauseJob(job.id);

    expect(listener).toHaveBeenCalled();
    await scheduler.shutdown();
  });

  it("应该在恢复任务时触发事件", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const job = scheduler.createJob({
      label: "event-test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    scheduler.pauseJob(job.id);

    const listener = mock(() => {});
    scheduler.on("job:resumed", listener);

    scheduler.resumeJob(job.id);

    expect(listener).toHaveBeenCalled();
    await scheduler.shutdown();
  });
});

describe("CronScheduler - 统计信息", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能获取统计信息", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    scheduler.createJob({ label: "job1", prompt: "test", cronExpression: "*/5 * * * *" });
    scheduler.createJob({ label: "job2", prompt: "test", cronExpression: "*/10 * * * *" });

    const job3 = scheduler.createJob({ label: "job3", prompt: "test", cronExpression: "*/15 * * * *" });
    scheduler.pauseJob(job3.id);

    const stats = await scheduler.getStats();

    expect(stats.totalJobs).toBe(3);
    expect(stats.enabledJobs).toBe(2);
    expect(stats.pausedJobs).toBe(1);

    await scheduler.shutdown();
  });
});

describe("CronScheduler - 执行历史", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能获取任务执行历史", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const job = scheduler.createJob({
      label: "history-test",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const mockExecutor = mock(async (job) => ({
      jobId: job.id,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 100,
      success: true,
      output: `Result: ${job.prompt}`,
    }));

    await scheduler.runJobNow(job.id, mockExecutor);
    await scheduler.runJobNow(job.id, mockExecutor);

    const history = await scheduler.getJobHistory(job.id);
    expect(history.length).toBe(2);
    expect(history[0].success).toBe(true);

    await scheduler.shutdown();
  });

  it("应该能限制历史记录数量", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const job = scheduler.createJob({
      label: "history-limit",
      prompt: "test",
      cronExpression: "*/5 * * * *",
    });

    const mockExecutor = mock(async (job) => ({
      jobId: job.id,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 100,
      success: true,
      output: "ok",
    }));

    for (let i = 0; i < 5; i++) {
      await scheduler.runJobNow(job.id, mockExecutor);
    }

    const history = await scheduler.getJobHistory(job.id, 3);
    expect(history.length).toBe(3);

    await scheduler.shutdown();
  });

  it("应该在不存在的任务上返回空数组", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const history = await scheduler.getJobHistory("nonexistent");
    expect(history.length).toBe(0);

    await scheduler.shutdown();
  });
});

describe("CronScheduler - 一次性任务", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该在执行后将一次性任务标记为完成", async () => {
    const scheduler = createTestScheduler();
    await scheduler.initialize();

    const futureTime = Date.now() + 60000;
    const job = scheduler.createJob({
      label: "once-task",
      prompt: "test",
      runAt: futureTime,
      type: "once",
    });

    const mockExecutor = mock(async (job) => ({
      jobId: job.id,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 100,
      success: true,
      output: "done",
    }));
    await scheduler.runJobNow(job.id, mockExecutor);

    const updated = scheduler.getJob(job.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.runCount).toBe(1);

    await scheduler.shutdown();
  });

  it("应该为一次性任务设置 maxRuns 为 1", () => {
    const scheduler = createTestScheduler();
    const job = scheduler.createJob({
      label: "once-task",
      prompt: "test",
      runAt: Date.now() + 60000,
    });

    expect(job.maxRuns).toBe(1);
  });
});
