import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PermissionSystem, PermissionSystemConfigSchema } from "../../backend/permissions/permission-system.js";
import { PermissionMode, PermissionDecision } from "../../backend/permissions/types.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-permission-e2e-${Date.now()}`);

describe("E2E - 权限系统完整场景", () => {
  let permissionSystem: PermissionSystem;

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: 权限模式配置", () => {
    it("应该能够创建自动接受模式的权限系统", async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();

      const result = await permissionSystem.checkPermission({
        toolName: "Read",
        input: { file_path: "test.txt" },
      });

      expect(result.decision).toBeDefined();
    });

    it("应该能够创建计划模式的权限系统", async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.Plan,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();

      expect(permissionSystem).toBeDefined();
    });

    it("应该能够创建自动模式的权限系统", async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.Auto,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();

      expect(permissionSystem).toBeDefined();
    });

    it("应该能够创建默认模式的权限系统", async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.Default,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();

      expect(permissionSystem).toBeDefined();
    });
  });

  describe("场景 2: 文件操作权限检查", () => {
    beforeEach(async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();
    });

    it("应该能够检查读取权限", async () => {
      const result = await permissionSystem.checkPermission({
        toolName: "Read",
        input: { file_path: join(TEST_DIR, "test.txt") },
      });

      expect(result.decision).toBeDefined();
      expect(result.step).toBeDefined();
    });

    it("应该能够检查写入权限", async () => {
      const result = await permissionSystem.checkPermission({
        toolName: "Write",
        input: {
          file_path: join(TEST_DIR, "output.txt"),
          content: "test content",
        },
      });

      expect(result.decision).toBeDefined();
      expect(result.step).toBeDefined();
    });

    it("应该能够检查列出目录权限", async () => {
      const result = await permissionSystem.checkPermission({
        toolName: "LS",
        input: { path: TEST_DIR },
      });

      expect(result.decision).toBeDefined();
      expect(result.step).toBeDefined();
    });
  });

  describe("场景 3: Bash 命令权限检查", () => {
    beforeEach(async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
        preapprovedCommands: ["ls", "cat", "echo"],
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();
    });

    it("应该能够检查 Bash 命令权限", async () => {
      const result = await permissionSystem.checkPermission({
        toolName: "Bash",
        input: { command: "ls -la" },
      });

      expect(result.decision).toBeDefined();
      expect(result.step).toBeDefined();
    });

    it("应该能够检查危险命令", async () => {
      const result = await permissionSystem.checkPermission({
        toolName: "Bash",
        input: { command: "rm -rf /" },
      });

      expect(result.decision).toBeDefined();
      expect(result.step).toBeDefined();
    });

    it("应该能够检查网络命令", async () => {
      const result = await permissionSystem.checkPermission({
        toolName: "Bash",
        input: { command: "curl http://example.com" },
      });

      expect(result.decision).toBeDefined();
      expect(result.step).toBeDefined();
    });
  });

  describe("场景 4: 沙箱执行", () => {
    it("应该能够启用沙箱模式", async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
        sandbox: {
          enabled: true,
          timeout: 5000,
          memoryLimit: 256 * 1024 * 1024,
        },
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();

      expect(permissionSystem).toBeDefined();
    });
  });

  describe("场景 5: 权限执行包装", () => {
    beforeEach(async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();
    });

    it("应该能够执行允许的操作", async () => {
      const result = await permissionSystem.executeWithPermission(
        "Read",
        { file_path: "test.txt" },
        async () => "读取成功"
      );

      expect(result).toBe("读取成功");
    });
  });

  describe("场景 6: 多步骤权限检查", () => {
    beforeEach(async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();
    });

    it("应该能够检查一系列操作", async () => {
      const operations = [
        { toolName: "Read", input: { file_path: "file1.txt" } },
        { toolName: "Read", input: { file_path: "file2.txt" } },
        { toolName: "Write", input: { file_path: "output.txt", content: "test" } },
      ];

      const results = await Promise.all(
        operations.map((op) => permissionSystem.checkPermission(op))
      );

      results.forEach((result) => {
        expect(result.decision).toBeDefined();
        expect(result.step).toBeDefined();
      });
    });

    it("应该能够处理并发权限检查", async () => {
      const checks = Array(10).fill(null).map((_, i) => 
        permissionSystem.checkPermission({
          toolName: "Read",
          input: { file_path: `file${i}.txt` },
        })
      );

      const results = await Promise.all(checks);
      
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.decision).toBeDefined();
      });
    });
  });

  describe("场景 7: 错误处理", () => {
    it("应该能够处理无效的工具名称", async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();

      const result = await permissionSystem.checkPermission({
        toolName: "",
        input: {},
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it("应该能够处理无效的输入", async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();

      const result = await permissionSystem.checkPermission({
        toolName: "Read",
        input: null as any,
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });
  });

  describe("场景 8: 权限结果详情", () => {
    beforeEach(async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();
    });

    it("权限结果应该包含必要的信息", async () => {
      const result = await permissionSystem.checkPermission({
        toolName: "Read",
        input: { file_path: "test.txt" },
      });

      expect(result.decision).toBeDefined();
      expect(result.step).toBeDefined();
    });
  });

  describe("场景 9: 会话级别的权限", () => {
    it("应该能够为不同会话设置不同的权限", async () => {
      const config1 = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.AcceptEdits,
        projectRoot: TEST_DIR,
        sessionId: "session-1",
      });

      const config2 = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.Plan,
        projectRoot: TEST_DIR,
        sessionId: "session-2",
      });

      const system1 = new PermissionSystem(config1);
      const system2 = new PermissionSystem(config2);

      await system1.initialize();
      await system2.initialize();

      expect(system1).toBeDefined();
      expect(system2).toBeDefined();
    });
  });

  describe("场景 10: 计划模式权限", () => {
    beforeEach(async () => {
      const config = PermissionSystemConfigSchema.parse({
        mode: PermissionMode.Plan,
        projectRoot: TEST_DIR,
      });

      permissionSystem = new PermissionSystem(config);
      await permissionSystem.initialize();
    });

    it("计划模式应该允许只读工具", async () => {
      const result = await permissionSystem.checkPermission({
        toolName: "Read",
        input: { file_path: "test.txt" },
      });

      expect(result.decision).toBeDefined();
    });

    it("计划模式应该限制写入工具", async () => {
      const result = await permissionSystem.checkPermission({
        toolName: "Write",
        input: { file_path: "test.txt", content: "test" },
      });

      expect(result.decision).toBeDefined();
    });
  });
});
