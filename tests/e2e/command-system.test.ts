import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  CommandRegistry,
  CommandDefinitionSchema,
  CommandHandlerSchema,
} from "../../backend/commands/command-registry.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-commands-e2e-${Date.now()}`);

describe("E2E - 命令系统完整场景", () => {
  let registry: CommandRegistry;
  let projectDir: string;

  beforeEach(async () => {
    projectDir = join(TEST_DIR, "project");
    await mkdir(projectDir, { recursive: true });
    registry = new CommandRegistry();
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: 命令注册", () => {
    it("应该能够创建命令注册表", () => {
      expect(registry).toBeDefined();
      expect(registry.list().length).toBe(0);
    });

    it("应该能够注册新命令", () => {
      const command = {
        name: "hello",
        description: "Say hello",
        handler: async (args: string) => `Hello, ${args}!`,
      };

      registry.register(command);

      expect(registry.has("hello")).toBe(true);
      expect(registry.list().length).toBe(1);
    });

    it("应该能够注册带别名的命令", () => {
      const command = {
        name: "help",
        description: "Show help",
        aliases: ["h", "?"],
        handler: async () => "Help content",
      };

      registry.register(command);

      expect(registry.has("help")).toBe(true);
      expect(registry.has("h")).toBe(true);
      expect(registry.has("?")).toBe(true);
      expect(registry.list().length).toBe(3);
    });

    it("应该能够验证有效的命令定义", () => {
      const validCommand = {
        name: "test",
        description: "Test command",
        handler: async () => "test",
      };

      const result = CommandDefinitionSchema.safeParse(validCommand);
      expect(result.success).toBe(true);
    });

    it("应该能够检测无效的命令定义", () => {
      const invalidCommand = {
        name: 123,
        description: null,
        handler: "not-a-function",
      };

      const result = CommandDefinitionSchema.safeParse(invalidCommand);
      expect(result.success).toBe(false);
    });

    it("应该能够验证有效的命令处理器", () => {
      const validHandler = async (args: string) => args;
      const result = CommandHandlerSchema.safeParse(validHandler);
      expect(result.success).toBe(true);
    });
  });

  describe("场景 2: 命令执行", () => {
    it("应该能够执行命令", async () => {
      registry.register({
        name: "greet",
        description: "Greet someone",
        handler: async (name: string) => `Hello, ${name}!`,
      });

      const result = await registry.execute("greet", "World");
      expect(result).toBe("Hello, World!");
    });

    it("执行不存在的命令应该返回错误消息", async () => {
      const result = await registry.execute("nonexistent", "args");
      expect(result).toContain("Unknown command");
    });

    it("命令抛出错误应该返回错误信息", async () => {
      registry.register({
        name: "error",
        description: "Throw error",
        handler: async () => {
          throw new Error("Something went wrong");
        },
      });

      const result = await registry.execute("error", "");
      expect(result).toContain("Error executing");
      expect(result).toContain("Something went wrong");
    });

    it("应该能够执行带参数的命令", async () => {
      registry.register({
        name: "add",
        description: "Add two numbers",
        handler: async (args: string) => {
          const [a, b] = args.split(" ").map(Number);
          return String(a + b);
        },
      });

      const result = await registry.execute("add", "2 3");
      expect(result).toBe("5");
    });

    it("应该能够执行空参数命令", async () => {
      registry.register({
        name: "ping",
        description: "Ping command",
        handler: async () => "pong",
      });

      const result = await registry.execute("ping", "");
      expect(result).toBe("pong");
    });
  });

  describe("场景 3: 命令管理", () => {
    it("应该能够列出所有命令", () => {
      for (let i = 1; i <= 5; i++) {
        registry.register({
          name: `cmd-${i}`,
          description: `Command ${i}`,
          handler: async () => `result ${i}`,
        });
      }

      const commands = registry.list();
      expect(commands.length).toBe(5);
      expect(commands.every(c => c.name.startsWith("cmd-"))).toBe(true);
    });

    it("应该能够获取命令名称列表", () => {
      registry.register({
        name: "cmd1",
        description: "Command 1",
        handler: async () => "1",
      });
      registry.register({
        name: "cmd2",
        description: "Command 2",
        handler: async () => "2",
      });

      const names = registry.getNames();
      expect(names).toContain("cmd1");
      expect(names).toContain("cmd2");
      expect(names.length).toBe(2);
    });

    it("应该能够获取单个命令", () => {
      registry.register({
        name: "test-cmd",
        description: "Test command",
        handler: async () => "test",
      });

      const command = registry.get("test-cmd");
      expect(command).toBeDefined();
      expect(command?.name).toBe("test-cmd");
      expect(command?.description).toBe("Test command");
    });

    it("获取不存在的命令应该返回 undefined", () => {
      const command = registry.get("nonexistent");
      expect(command).toBeUndefined();
    });

    it("应该能够取消注册命令", () => {
      registry.register({
        name: "to-remove",
        description: "To remove",
        handler: async () => "remove",
      });

      expect(registry.has("to-remove")).toBe(true);
      registry.unregister("to-remove");
      expect(registry.has("to-remove")).toBe(false);
    });

    it("取消注册不存在的命令不应该出错", () => {
      expect(() => registry.unregister("nonexistent")).not.toThrow();
    });
  });

  describe("场景 4: 命令别名", () => {
    it("应该能够通过别名执行命令", async () => {
      registry.register({
        name: "help",
        description: "Show help",
        aliases: ["h"],
        handler: async () => "Help content",
      });

      const result1 = await registry.execute("help", "");
      const result2 = await registry.execute("h", "");

      expect(result1).toBe("Help content");
      expect(result2).toBe("Help content");
    });

    it("别名应该独立存在于列表中", () => {
      registry.register({
        name: "command",
        description: "Command with aliases",
        aliases: ["alias1", "alias2"],
        handler: async () => "result",
      });

      expect(registry.has("command")).toBe(true);
      expect(registry.has("alias1")).toBe(true);
      expect(registry.has("alias2")).toBe(true);
    });

    it("取消注册原始命令不影响别名", () => {
      registry.register({
        name: "main",
        description: "Main command",
        aliases: ["alt"],
        handler: async () => "result",
      });

      registry.unregister("main");

      expect(registry.has("main")).toBe(false);
      expect(registry.has("alt")).toBe(true);
    });
  });

  describe("场景 5: 文件操作命令", () => {
    it("应该能够执行创建文件命令", async () => {
      registry.register({
        name: "create",
        description: "Create file",
        handler: async (args: string) => {
          const [filename, content] = args.split("|");
          const filePath = join(projectDir, filename);
          await writeFile(filePath, content);
          return `Created ${filename}`;
        },
      });

      const result = await registry.execute("create", "test.txt|Hello World!");
      expect(result).toBe("Created test.txt");
    });

    it("应该能够执行文件操作链式命令", async () => {
      let fileCount = 0;

      registry.register({
        name: "touch",
        description: "Create empty file",
        handler: async (filename: string) => {
          await writeFile(join(projectDir, filename), "");
          fileCount++;
          return `Touched ${filename}`;
        },
      });

      const results = await Promise.all([
        registry.execute("touch", "file1.txt"),
        registry.execute("touch", "file2.txt"),
        registry.execute("touch", "file3.txt"),
      ]);

      expect(results.length).toBe(3);
      expect(fileCount).toBe(3);
    });
  });

  describe("场景 6: 并发命令执行", () => {
    it("应该能够处理并发命令执行", async () => {
      let executionCount = 0;

      registry.register({
        name: "count",
        description: "Count execution",
        handler: async () => {
          executionCount++;
          return String(executionCount);
        },
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(registry.execute("count", ""));
      }

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      expect(executionCount).toBe(10);
    });

    it("并发命令不应该互相干扰", async () => {
      registry.register({
        name: "echo",
        description: "Echo input",
        handler: async (input: string) => input,
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(registry.execute("echo", `message-${i}`));
      }

      const results = await Promise.all(promises);

      expect(results).toEqual(["message-0", "message-1", "message-2", "message-3", "message-4"]);
    });
  });

  describe("场景 7: 命令工厂函数", () => {
    it("应该能够通过工厂函数创建注册表", () => {
      const newRegistry = new CommandRegistry();
      expect(newRegistry).toBeDefined();
      expect(newRegistry.list().length).toBe(0);
    });
  });

  describe("场景 8: 复杂命令场景", () => {
    it("应该能够执行状态ful命令", async () => {
      let state = { counter: 0 };

      registry.register({
        name: "increment",
        description: "Increment counter",
        handler: async () => {
          state.counter++;
          return String(state.counter);
        },
      });

      registry.register({
        name: "reset",
        description: "Reset counter",
        handler: async () => {
          state.counter = 0;
          return "Reset";
        },
      });

      await registry.execute("increment", "");
      await registry.execute("increment", "");
      expect(state.counter).toBe(2);

      await registry.execute("reset", "");
      expect(state.counter).toBe(0);
    });

    it("命令应该能够调用其他命令", async () => {
      registry.register({
        name: "add-one",
        description: "Add one",
        handler: async (n: string) => String(parseInt(n) + 1),
      });

      registry.register({
        name: "double",
        description: "Double number",
        handler: async (n: string) => String(parseInt(n) * 2),
      });

      registry.register({
        name: "complex",
        description: "Complex calculation",
        handler: async (n: string) => {
          const step1 = await registry.execute("add-one", n);
          const step2 = await registry.execute("double", step1);
          return step2;
        },
      });

      const result = await registry.execute("complex", "5");
      expect(result).toBe("12");
    });
  });
});
