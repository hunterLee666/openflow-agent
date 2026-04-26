import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createTestEnvironment,
  setupTestEnvironment,
  teardownTestEnvironment,
  MockLLM,
  MockFileSystem,
  generateRandomString,
  generateLargeContent,
  measureTime,
} from "./test-utils.js";

describe("E2E - 边缘案例测试", () => {
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

  describe("边缘案例 1: 输入边界值", () => {
    it("应该能够处理空输入", async () => {
      mockLLM.setDefaultResponse("请提供更多信息");

      const response = await mockLLM.generate("");
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    });

    it("应该能够处理极长输入", async () => {
      const veryLongInput = generateLargeContent(500); 
      
      mockLLM.setDefaultResponse("我收到了你的长文本");

      const { result, durationMs } = await measureTime(async () => {
        return mockLLM.generate(veryLongInput);
      });

      expect(result).toBe("我收到了你的长文本");
      expect(durationMs).toBeLessThan(5000);
    });

    it("应该能够处理特殊字符输入", async () => {
      const specialChars = "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
      const unicodeText = "你好世界 🌍 こんにちは 안녕하세요";

      mockLLM.setResponse(specialChars, "收到特殊字符");
      mockLLM.setResponse(unicodeText, "收到Unicode文本");

      const response1 = await mockLLM.generate(specialChars);
      const response2 = await mockLLM.generate(unicodeText);

      expect(response1).toBe("收到特殊字符");
      expect(response2).toBe("收到Unicode文本");
    });
  });

  describe("边缘案例 2: 文件系统边界", () => {
    it("应该能够处理大文件", async () => {
      const largeContent = generateLargeContent(100); 
      const filePath = "/large-file.txt";

      const { durationMs } = await measureTime(async () => {
        mockFS.writeFile(filePath, largeContent);
      });

      expect(mockFS.exists(filePath)).toBe(true);
      expect(durationMs).toBeLessThan(1000);

      const readContent = mockFS.readFile(filePath);
      expect(readContent?.length).toBe(largeContent.length);
    });

    it("应该能够处理嵌套目录", async () => {
      const nestedPaths = [
        "/level1/level2/level3/file1.txt",
        "/level1/file2.txt",
        "/level1/level2/file3.txt",
      ];

      for (const path of nestedPaths) {
        mockFS.writeFile(path, `内容: ${path}`);
      }

      for (const path of nestedPaths) {
        expect(mockFS.exists(path)).toBe(true);
        expect(mockFS.readFile(path)).toBe(`内容: ${path}`);
      }
    });

    it("应该能够处理大量小文件", async () => {
      const fileCount = 100;

      for (let i = 0; i < fileCount; i++) {
        mockFS.writeFile(`/file-${i}.txt`, `内容 ${i}`);
      }

      expect(mockFS.listFiles().length).toBe(fileCount);

      for (let i = 0; i < fileCount; i++) {
        expect(mockFS.readFile(`/file-${i}.txt`)).toBe(`内容 ${i}`);
      }
    });
  });

  describe("边缘案例 3: 错误与恢复", () => {
    it("应该能够从错误状态中恢复", async () => {
      let errorCount = 0;

      mockLLM.setResponse("正常查询", "正常响应");

      const normalResponse = await mockLLM.generate("正常查询");
      expect(normalResponse).toBe("正常响应");

      mockLLM.reset();

      mockLLM.setDefaultResponse("恢复后的响应");
      const recoveredResponse = await mockLLM.generate("恢复查询");
      expect(recoveredResponse).toBe("恢复后的响应");
    });

    it("应该能够处理连续的请求", async () => {
      const requestCount = 50;
      mockLLM.setDefaultResponse("OK");

      const { durationMs } = await measureTime(async () => {
        for (let i = 0; i < requestCount; i++) {
          await mockLLM.generate(`请求 ${i}`);
        }
      });

      expect(mockLLM.getCallCount()).toBe(requestCount);
      expect(durationMs).toBeLessThan(5000);
    });
  });

  describe("边缘案例 4: 内存与性能", () => {
    it("应该能够处理大量的Mock数据", async () => {
      const dataCount = 1000;

      const { durationMs } = await measureTime(async () => {
        for (let i = 0; i < dataCount; i++) {
          mockFS.writeFile(`/data-${i}.txt`, generateRandomString(100));
        }
      });

      expect(mockFS.listFiles().length).toBe(dataCount);
      expect(durationMs).toBeLessThan(10000);
    });

    it("应该在多次重置后保持稳定", async () => {
      const resetCount = 100;

      const { durationMs } = await measureTime(async () => {
        for (let i = 0; i < resetCount; i++) {
          mockFS.writeFile(`/test-${i}.txt`, "内容");
          mockFS.reset();
        }
      });

      expect(mockFS.listFiles().length).toBe(0);
      expect(durationMs).toBeLessThan(10000);
    });
  });

  describe("边缘案例 5: 随机性与不确定性", () => {
    it("应该能够处理随机生成的输入", async () => {
      for (let i = 0; i < 20; i++) {
        const randomInput = generateRandomString(Math.floor(Math.random() * 100) + 1);
        mockLLM.setResponse(randomInput, `响应: ${randomInput}`);

        const response = await mockLLM.generate(randomInput);
        expect(response).toBe(`响应: ${randomInput}`);
      }
    });
  });

  describe("边缘案例 6: 空状态与初始状态", () => {
    it("应该能够在初始空状态下工作", async () => {
      const emptyFS = new MockFileSystem();

      expect(emptyFS.listFiles().length).toBe(0);

      const nonExistent = emptyFS.readFile("/nonexistent.txt");
      expect(nonExistent).toBeUndefined();

      const emptyLLM = new MockLLM();
      expect(emptyLLM.getCallCount()).toBe(0);
    });

    it("应该能够正确处理边界值查询", async () => {
      const edgeCases = [
        " ",
        "\t",
        "\n",
        "\r\n",
        "null",
        "undefined",
        "0",
        "-1",
      ];

      for (const edgeCase of edgeCases) {
        mockLLM.setResponse(edgeCase, `处理了: ${JSON.stringify(edgeCase)}`);
        const response = await mockLLM.generate(edgeCase);
        expect(response).toBeDefined();
      }
    });
  });
});
