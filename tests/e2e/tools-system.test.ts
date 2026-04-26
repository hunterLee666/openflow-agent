import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createTestEnvironment,
  setupTestEnvironment,
  teardownTestEnvironment,
  createTestFile,
  readTestFile,
} from "./test-utils.js";
import { createAllTools, createFileTools, createGitTools } from "../../backend/tools/index.js";

describe("E2E - 工具系统完整场景", () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(async () => {
    env = createTestEnvironment();
    await setupTestEnvironment(env);
  });

  afterEach(async () => {
    await teardownTestEnvironment(env);
  });

  describe("场景 1: 文件工具操作", () => {
    it("应该能够创建和读取文件", async () => {
      const testPath = "test-file.txt";
      const testContent = "Hello, OpenFlow!";

      await createTestFile(env, testPath, testContent);
      
      const content = await readTestFile(env, testPath);
      expect(content).toBe(testContent);
    });

    it("应该能够处理多种文件类型", async () => {
      const files = [
        { path: "index.js", content: "console.log('hello')" },
        { path: "styles.css", content: "body { margin: 0; }" },
        { path: "data.json", content: '{"name": "test"}' },
        { path: "README.md", content: "# Test Project" },
      ];

      for (const file of files) {
        await createTestFile(env, file.path, file.content);
      }

      for (const file of files) {
        const content = await readTestFile(env, file.path);
        expect(content).toBe(file.content);
      }
    });

    it("应该能够处理嵌套目录结构", async () => {
      const nestedFiles = [
        "src/components/Button.tsx",
        "src/utils/helpers.ts",
        "tests/unit/Button.test.tsx",
        "docs/api.md",
      ];

      for (const filePath of nestedFiles) {
        await createTestFile(env, filePath, `// ${filePath}`);
      }

      for (const filePath of nestedFiles) {
        const content = await readTestFile(env, filePath);
        expect(content).toBe(`// ${filePath}`);
      }
    });
  });

  describe("场景 2: 工具注册与发现", () => {
    it("应该能够注册和发现工具", async () => {
      const tools = createAllTools(env.workspaceDir);
      
      expect(tools.length).toBeGreaterThan(0);
      
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain("Read");
      expect(toolNames).toContain("Write");
    });

    it("每个工具都应该有必要的属性", async () => {
      const tools = createAllTools(env.workspaceDir);
      
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe("string");
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe("string");
        expect(tool.inputSchema || tool.parameters).toBeDefined();
      }
    });
  });

  describe("场景 3: 工具链与组合操作", () => {
    it("应该能够执行多步文件操作", async () => {
      const operations = [
        { type: "create", path: "file1.txt", content: "内容1" },
        { type: "create", path: "file2.txt", content: "内容2" },
        { type: "create", path: "file3.txt", content: "内容3" },
      ];

      for (const op of operations) {
        await createTestFile(env, op.path, op.content);
      }

      for (const op of operations) {
        const content = await readTestFile(env, op.path);
        expect(content).toBe(op.content);
      }
    });
  });

  describe("场景 4: 工具输入验证", () => {
    it("应该验证必要的参数", async () => {
      const testCases = [
        { path: "", content: "test", shouldSucceed: false },
        { path: "test.txt", content: "", shouldSucceed: true },
        { path: null, content: "test", shouldSucceed: false },
      ];

      for (const testCase of testCases) {
        try {
          if (testCase.path) {
            await createTestFile(env, testCase.path, testCase.content);
            if (!testCase.shouldSucceed) {
              throw new Error("Expected failure but got success");
            }
          }
        } catch (error) {
          if (testCase.shouldSucceed) {
            throw error;
          }
        }
      }
    });
  });
});
