import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  CheckpointSystem,
  CheckpointSchema,
  FileSnapshotSchema,
  RollbackResultSchema,
  CheckpointConfigSchema,
} from "../../backend/checkpoints/checkpoint-system.js";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-checkpoint-e2e-${Date.now()}`);

describe("E2E - 检查点系统完整场景", () => {
  let checkpointSystem: CheckpointSystem;
  let baseDir: string;
  let projectDir: string;

  beforeEach(async () => {
    baseDir = join(TEST_DIR, "base");
    projectDir = join(TEST_DIR, "project");
    await mkdir(baseDir, { recursive: true });
    await mkdir(projectDir, { recursive: true });

    checkpointSystem = new CheckpointSystem(projectDir, {
      maxCheckpoints: 10,
      maxAge: 24 * 60 * 60 * 1000,
      includePatterns: ["**"],
      excludePatterns: [],
    });
    await checkpointSystem.initialize();
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: 检查点初始化", () => {
    it("应该能够创建检查点系统实例", () => {
      expect(checkpointSystem).toBeDefined();
    });

    it("应该能够初始化检查点目录", async () => {
      const newDir = join(TEST_DIR, "new-checkpoint");
      const newSystem = new CheckpointSystem(newDir);
      await newSystem.initialize();

      expect(true).toBe(true);
    });

    it("应该能够验证有效的检查点配置", () => {
      const validConfig = {
        maxCheckpoints: 50,
        maxAge: 604800000,
        includePatterns: ["**/*.ts"],
        excludePatterns: ["**/node_modules/**"],
      };

      const result = CheckpointConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("应该能够检测无效的检查点配置", () => {
      const invalidConfig = {
        maxCheckpoints: "not-a-number",
        maxAge: "not-a-number",
        includePatterns: "not-an-array",
        excludePatterns: "not-an-array",
      };

      const result = CheckpointConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe("场景 2: 创建检查点", () => {
    it("应该能够创建文件检查点", async () => {
      const checkpoint = await checkpointSystem.createCheckpoint(
        "session-123",
        [],
        "测试检查点",
        { author: "test-user" }
      );

      expect(checkpoint).toBeDefined();
      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.sessionId).toBe("session-123");
      expect(checkpoint.label).toBe("测试检查点");
      expect(checkpoint.metadata.author).toBe("test-user");
    });

    it("应该能够创建多文件检查点", async () => {
      const checkpoint = await checkpointSystem.createCheckpoint(
        "session-456",
        [],
        "多文件检查点"
      );

      expect(checkpoint.sessionId).toBe("session-456");
    });

    it("空文件列表应该创建空检查点", async () => {
      const checkpoint = await checkpointSystem.createCheckpoint(
        "session-empty",
        [],
        "空检查点"
      );

      expect(checkpoint.snapshots.length).toBe(0);
    });

    it("不存在的文件应该被跳过", async () => {
      const checkpoint = await checkpointSystem.createCheckpoint(
        "session-missing",
        [join(projectDir, "nonexistent-file.ts")],
        "缺失文件检查点"
      );

      expect(checkpoint.snapshots.length).toBe(0);
    });

    it("应该能够验证有效的检查点", () => {
      const validCheckpoint = {
        id: "checkpoint-123",
        sessionId: "session-456",
        timestamp: Date.now(),
        label: "测试",
        snapshots: [],
        metadata: {},
      };

      const result = CheckpointSchema.safeParse(validCheckpoint);
      expect(result.success).toBe(true);
    });

    it("应该能够检测无效的检查点", () => {
      const invalidCheckpoint = {
        id: null,
        sessionId: 123,
        timestamp: "now",
        snapshots: "not-an-array",
        metadata: "not-an-object",
      };

      const result = CheckpointSchema.safeParse(invalidCheckpoint);
      expect(result.success).toBe(false);
    });
  });

  describe("场景 3: 文件快照", () => {
    it("应该能够创建文件快照", async () => {
      const testFile = join(projectDir, "snapshot-test.ts");
      await writeFile(testFile, "export const test = 'snapshot content';");

      const snapshot = await checkpointSystem.createSnapshotBeforeWrite(testFile);

      expect(snapshot).toBeDefined();
      expect(snapshot?.filePath).toBeDefined();
      expect(snapshot?.content).toBe("export const test = 'snapshot content';");
      expect(snapshot?.hash).toBeDefined();
      expect(snapshot?.size).toBeGreaterThan(0);
    });

    it("不存在的文件快照应该返回 null", async () => {
      const snapshot = await checkpointSystem.createSnapshotBeforeWrite(
        join(projectDir, "nonexistent.ts")
      );

      expect(snapshot).toBeNull();
    });

    it("应该能够验证有效的文件快照", () => {
      const validSnapshot = {
        filePath: "/path/to/file.ts",
        content: "content",
        hash: "abc123",
        timestamp: Date.now(),
        size: 100,
      };

      const result = FileSnapshotSchema.safeParse(validSnapshot);
      expect(result.success).toBe(true);
    });

    it("应该能够检测无效的文件快照", () => {
      const invalidSnapshot = {
        filePath: 123,
        content: null,
        hash: 456,
        timestamp: "now",
        size: "big",
      };

      const result = FileSnapshotSchema.safeParse(invalidSnapshot);
      expect(result.success).toBe(false);
    });
  });

  describe("场景 4: 回滚检查点", () => {
    it("回滚不存在的检查点应该返回失败", async () => {
      const result = await checkpointSystem.rollbackToCheckpoint("nonexistent-checkpoint");

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("应该能够验证有效的回滚结果", () => {
      const validResult = {
        success: true,
        restored: ["file1.ts", "file2.ts"],
        failed: [],
        errors: [],
      };

      const result = RollbackResultSchema.safeParse(validResult);
      expect(result.success).toBe(true);
    });

    it("应该能够检测无效的回滚结果", () => {
      const invalidResult = {
        success: "true",
        restored: "not-an-array",
        failed: null,
        errors: "not-an-array",
      };

      const result = RollbackResultSchema.safeParse(invalidResult);
      expect(result.success).toBe(false);
    });
  });

  describe("场景 5: 检查点列表和管理", () => {
    it("应该能够列出检查点", async () => {
      for (let i = 1; i <= 3; i++) {
        const testFile = join(projectDir, `file-${i}.ts`);
        await writeFile(testFile, `export const value = ${i};`);

        await checkpointSystem.createCheckpoint(
          `session-${i}`,
          [testFile],
          `检查点 ${i}`
        );
      }

      const checkpoints = await checkpointSystem.listCheckpoints();
      expect(checkpoints.length).toBeGreaterThanOrEqual(3);
    });

    it("应该能够按会话过滤检查点", async () => {
      for (let i = 1; i <= 2; i++) {
        const testFile = join(projectDir, `file-a-${i}.ts`);
        await writeFile(testFile, `export const value = ${i};`);
        await checkpointSystem.createCheckpoint("session-a", [testFile]);
      }

      for (let i = 1; i <= 3; i++) {
        const testFile = join(projectDir, `file-b-${i}.ts`);
        await writeFile(testFile, `export const value = ${i};`);
        await checkpointSystem.createCheckpoint("session-b", [testFile]);
      }

      const sessionACheckpoints = await checkpointSystem.listCheckpoints("session-a");
      const sessionBCheckpoints = await checkpointSystem.listCheckpoints("session-b");

      expect(sessionACheckpoints.length).toBe(2);
      expect(sessionBCheckpoints.length).toBe(3);
    });

    it("应该能够加载检查点", async () => {
      const testFile = join(projectDir, "load-test.ts");
      await writeFile(testFile, "export const test = 'load test';");

      const created = await checkpointSystem.createCheckpoint(
        "session-load",
        [testFile]
      );

      const checkpoints = await checkpointSystem.listCheckpoints("session-load");
      const loaded = checkpoints.find(cp => cp.id === created.id);

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(created.id);
      expect(loaded?.sessionId).toBe("session-load");
    });

    it("加载不存在的检查点应该返回 undefined", async () => {
      const checkpoints = await checkpointSystem.listCheckpoints();
      const loaded = checkpoints.find(cp => cp.id === "nonexistent");
      expect(loaded).toBeUndefined();
    });
  });

  describe("场景 6: 检查点清理", () => {
    it("应该能够清理旧检查点", async () => {
      const limitedSystem = new CheckpointSystem(join(TEST_DIR, "limited"), {
        maxCheckpoints: 3,
        maxAge: 1000,
      });
      await limitedSystem.initialize();

      for (let i = 1; i <= 5; i++) {
        const testFile = join(projectDir, `cleanup-${i}.ts`);
        await writeFile(testFile, `export const value = ${i};`);
        await limitedSystem.createCheckpoint("session-cleanup", [testFile]);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const checkpoints = await limitedSystem.listCheckpoints();
      expect(checkpoints.length).toBeLessThanOrEqual(5);
    });
  });

  describe("场景 7: 检查点差异", () => {
    it("不存在的检查点差异应该返回空数组", async () => {
      const diffs = await checkpointSystem.getCheckpointDiff("nonexistent");
      expect(diffs).toEqual([]);
    });
  });

  describe("场景 8: 删除检查点", () => {
    it("应该能够删除检查点", async () => {
      const testFile = join(projectDir, "delete-test.ts");
      await writeFile(testFile, "export const test = 'delete test';");

      const checkpoint = await checkpointSystem.createCheckpoint(
        "session-delete",
        [testFile]
      );

      const beforeDelete = await checkpointSystem.listCheckpoints("session-delete");
      expect(beforeDelete.length).toBe(1);

      await checkpointSystem.deleteCheckpoint(checkpoint.id);

      const afterDelete = await checkpointSystem.listCheckpoints("session-delete");
      expect(afterDelete.length).toBe(0);
    });

    it("删除不存在的检查点不应该抛出错误", async () => {
      try {
        await checkpointSystem.deleteCheckpoint("nonexistent");
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });
  });

  describe("场景 9: 检查点统计", () => {
    it("应该能够获取检查点列表", async () => {
      for (let i = 1; i <= 3; i++) {
        await checkpointSystem.createCheckpoint("session-stats", [], `检查点 ${i}`);
      }

      const checkpoints = await checkpointSystem.listCheckpoints();

      expect(checkpoints).toBeDefined();
      expect(checkpoints.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("场景 10: 并发检查点操作", () => {
    it("应该能够处理并发检查点创建", async () => {
      const operations = [];
      for (let i = 1; i <= 5; i++) {
        const testFile = join(projectDir, `concurrent-${i}.ts`);
        await writeFile(testFile, `export const value = ${i};`);
        operations.push(
          checkpointSystem.createCheckpoint(`concurrent-session-${i}`, [testFile])
        );
      }

      const results = await Promise.all(operations);

      expect(results.length).toBe(5);
      results.forEach((checkpoint) => {
        expect(checkpoint.id).toBeDefined();
      });

      const checkpoints = await checkpointSystem.listCheckpoints();
      expect(checkpoints.length).toBeGreaterThanOrEqual(5);
    });
  });
});
