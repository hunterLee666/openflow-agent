import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createTestEnvironment,
  setupTestEnvironment,
  teardownTestEnvironment,
  createTestFile,
  readTestFile,
  MockLLM,
  MockFileSystem,
  waitForCondition,
  measureTime,
  createTestScenario,
  generateRandomString,
} from "./test-utils.js";

describe("E2E - 核心用户场景", () => {
  let env: ReturnType<typeof createTestEnvironment>;
  let mockLLM: MockLLM;
  let mockFS: MockFileSystem;

  beforeEach(async () => {
    env = createTestEnvironment();
    await setupTestEnvironment(env);
    mockLLM = new MockLLM();
    mockFS = new MockFileSystem();
  });

  afterEach(async () => {
    await teardownTestEnvironment(env);
  });

  describe("场景 1: 基础文件操作", () => {
    it("应该能够创建、读取、更新和删除文件", async () => {
      const scenario = createTestScenario(
        "基础文件操作",
        "用户通过OpenFlow进行文件CRUD操作"
      );

      scenario
        .addStep("创建测试文件", "文件创建成功", async () => {
          await createTestFile(env, "test.txt", "Hello World");
          return true;
        })
        .addStep("读取文件内容", "内容正确", async () => {
          const content = await readTestFile(env, "test.txt");
          return content === "Hello World";
        })
        .addStep("更新文件内容", "更新成功", async () => {
          await createTestFile(env, "test.txt", "Hello Updated World");
          const content = await readTestFile(env, "test.txt");
          return content === "Hello Updated World";
        });

      for (const step of scenario.steps) {
        if (step.validate) {
          const result = await step.validate();
          expect(result).toBe(true);
        }
      }
    });

    it("应该能够处理多文件操作", async () => {
      const files = [
        { path: "src/index.ts", content: "console.log('hello')" },
        { path: "src/utils.ts", content: "export const add = (a, b) => a + b" },
        { path: "package.json", content: '{ "name": "test" }' },
      ];

      for (const file of files) {
        await createTestFile(env, file.path, file.content);
      }

      for (const file of files) {
        const content = await readTestFile(env, file.path);
        expect(content).toBe(file.content);
      }
    });
  });

  describe("场景 2: 模拟 LLM 对话流程", () => {
    it("应该能够处理多轮对话", async () => {
      const conversation = [
        { user: "你好", assistant: "你好！有什么我可以帮助你的吗？" },
        { user: "我在做一个项目", assistant: "听起来很棒！是什么项目呢？" },
        { user: "一个Todo应用", assistant: "好的，让我们来帮你构建Todo应用！" },
      ];

      mockLLM.setDefaultResponse("默认响应");
      for (const turn of conversation) {
        mockLLM.setResponse(turn.user, turn.assistant);
      }

      for (const turn of conversation) {
        const response = await mockLLM.generate(turn.user);
        expect(response).toBe(turn.assistant);
      }

      expect(mockLLM.getCallCount()).toBe(conversation.length);
    });

    it("应该能够测量响应时间", async () => {
      mockLLM.setDefaultResponse("快速响应");

      const { result, durationMs } = await measureTime(async () => {
        return mockLLM.generate("测试查询");
      });

      expect(result).toBe("快速响应");
      expect(durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("场景 3: Mock 文件系统操作", () => {
    it("应该能够模拟文件系统操作", async () => {
      const testPath = "/test/file.txt";
      const testContent = "测试内容";

      expect(mockFS.exists(testPath)).toBe(false);

      mockFS.writeFile(testPath, testContent);
      expect(mockFS.exists(testPath)).toBe(true);

      const readContent = mockFS.readFile(testPath);
      expect(readContent).toBe(testContent);

      const files = mockFS.listFiles();
      expect(files).toContain(testPath);

      mockFS.deleteFile(testPath);
      expect(mockFS.exists(testPath)).toBe(false);
    });

    it("应该能够重置mock文件系统", async () => {
      mockFS.writeFile("/file1.txt", "内容1");
      mockFS.writeFile("/file2.txt", "内容2");
      
      expect(mockFS.listFiles().length).toBe(2);

      mockFS.reset();
      
      expect(mockFS.listFiles().length).toBe(0);
    });
  });

  describe("场景 4: 等待条件测试", () => {
    it("应该能够等待条件满足", async () => {
      let flag = false;
      
      setTimeout(() => {
        flag = true;
      }, 100);

      await waitForCondition(() => flag, 1000);
      
      expect(flag).toBe(true);
    });

    it("应该在超时时抛出错误", async () => {
      let flag = false;

      await expect(
        waitForCondition(() => flag, 200)
      ).rejects.toThrow();
    });
  });

  describe("场景 5: 测试数据生成", () => {
    it("应该生成随机字符串", async () => {
      const str1 = generateRandomString(10);
      const str2 = generateRandomString(10);

      expect(str1).toHaveLength(10);
      expect(str2).toHaveLength(10);
      expect(str1).not.toBe(str2);
    });

    it("应该生成大内容", async () => {
      const largeContent = generateRandomString(10000);
      
      expect(largeContent.length).toBeGreaterThan(9000);
    });
  });
});
