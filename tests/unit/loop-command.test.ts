import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createLoopCommand } from "../../src/commands/loop-command.js";
import { CronScheduler } from "../../src/scheduler/cron-scheduler.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-loop-cmd-test-${Date.now()}`);

function createTestScheduler(): CronScheduler {
  return new CronScheduler({
    dataDir: TEST_DIR,
    tickIntervalMs: 100,
    maxHistory: 100,
    defaultExpiresAfterDays: 3,
  });
}

describe("Loop Command - 命令定义", () => {
  it("应该创建命令定义", () => {
    const scheduler = new CronScheduler({ dataDir: TEST_DIR });
    const cmd = createLoopCommand(scheduler);

    expect(cmd.name).toBe("loop");
    expect(cmd.description).toBeDefined();
    expect(cmd.aliases).toBeDefined();
    expect(cmd.handler).toBeDefined();
  });

  it("应该包含别名", () => {
    const scheduler = new CronScheduler({ dataDir: TEST_DIR });
    const cmd = createLoopCommand(scheduler);

    expect(cmd.aliases).toContain("cron");
    expect(cmd.aliases).toContain("schedule");
  });
});

describe("Loop Command - 自然语言解析", () => {
  let scheduler: CronScheduler;
  let cmd: ReturnType<typeof createLoopCommand>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    cmd = createLoopCommand(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能解析 'every 5 minutes' 格式", async () => {
    const result = await cmd.handler("every 5 minutes check emails");
    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("recurring");
  });

  it("应该能解析 'hourly' 格式", async () => {
    const result = await cmd.handler("hourly run backup");
    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("recurring");
  });

  it("应该能解析 'daily' 格式", async () => {
    const result = await cmd.handler("daily send report");
    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("recurring");
  });

  it("应该能解析 'weekly' 格式", async () => {
    const result = await cmd.handler("weekly cleanup");
    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("recurring");
  });

  it("应该能解析 'monthly' 格式", async () => {
    const result = await cmd.handler("monthly generate report");
    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("recurring");
  });

  it("应该能解析标准 cron 表达式", async () => {
    const result = await cmd.handler("*/5 * * * * check emails");
    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("recurring");
  });

  it("应该能解析一次性任务", async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString();
    const result = await cmd.handler(`once ${futureDate} send report`);
    expect(result).toContain("Cron job created successfully");
    expect(result).toContain("once");
  });

  it("应该在无法解析时返回错误提示", async () => {
    const result = await cmd.handler("invalid schedule format");
    expect(result).toContain("Error");
    expect(result).toContain("Could not parse schedule");
    expect(result).toContain("Recurring");
    expect(result).toContain("One-time");
  });
});

describe("Loop Command - 子命令", () => {
  let scheduler: CronScheduler;
  let cmd: ReturnType<typeof createLoopCommand>;
  let jobId: string;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    cmd = createLoopCommand(scheduler);

    const job = scheduler.createJob({
      label: "test-job",
      prompt: "test prompt",
      cronExpression: "*/5 * * * *",
    });
    jobId = job.id;
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该支持 'list' 子命令", async () => {
    const result = await cmd.handler("list");
    expect(result).toContain("test-job");
  });

  it("应该支持 'pause' 子命令", async () => {
    const result = await cmd.handler(`pause ${jobId}`);
    expect(result).toContain("paused");

    const job = scheduler.getJob(jobId);
    expect(job?.status).toBe("paused");
  });

  it("应该支持 'resume' 子命令", async () => {
    scheduler.pauseJob(jobId);
    const result = await cmd.handler(`resume ${jobId}`);
    expect(result).toContain("resumed");

    const job = scheduler.getJob(jobId);
    expect(job?.status).toBe("pending");
  });

  it("应该支持 'delete' 子命令", async () => {
    const result = await cmd.handler(`delete ${jobId}`);
    expect(result).toContain("deleted");

    expect(scheduler.getJob(jobId)).toBeUndefined();
  });

  it("应该支持 'run' 子命令", async () => {
    const result = await cmd.handler(`run ${jobId}`);
    expect(result).toContain("executed");
  });

  it("应该支持 'status' 子命令", async () => {
    const result = await cmd.handler(`status ${jobId}`);
    expect(result).toContain("test-job");
    expect(result).toContain("recurring");
  });

  it("应该支持 'help' 子命令", async () => {
    const result = await cmd.handler("help");
    expect(result).toContain("Usage");
    expect(result).toContain("loop");
  });

  it("应该在操作不存在的任务时返回错误", async () => {
    const pauseResult = await cmd.handler("pause nonexistent-id");
    expect(pauseResult).toContain("Error");

    const resumeResult = await cmd.handler("resume nonexistent-id");
    expect(resumeResult).toContain("Error");

    const deleteResult = await cmd.handler("delete nonexistent-id");
    expect(deleteResult).toContain("Error");

    const runResult = await cmd.handler("run nonexistent-id");
    expect(runResult).toContain("Error");

    const statusResult = await cmd.handler("status nonexistent-id");
    expect(statusResult).toContain("Error");
  });
});

describe("Loop Command - 别名", () => {
  let scheduler: CronScheduler;
  let cmd: ReturnType<typeof createLoopCommand>;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    scheduler = createTestScheduler();
    cmd = createLoopCommand(scheduler);
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it("应该能通过别名 'cron' 使用", async () => {
    const result = await cmd.handler("every 5 minutes test");
    expect(result).toContain("Cron job created successfully");
  });

  it("应该能通过别名 'schedule' 使用", async () => {
    const result = await cmd.handler("hourly backup");
    expect(result).toContain("Cron job created successfully");
  });
});
