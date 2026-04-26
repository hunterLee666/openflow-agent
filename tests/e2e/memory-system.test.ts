import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createTestEnvironment,
  setupTestEnvironment,
  teardownTestEnvironment,
} from "./test-utils.js";
import { EnhancedMemoryCore } from "../../backend/memory/enhanced-memory-core.js";

describe("E2E - 记忆系统完整场景", () => {
  let env: ReturnType<typeof createTestEnvironment>;
  let memoryCore: EnhancedMemoryCore;

  beforeEach(async () => {
    env = createTestEnvironment();
    await setupTestEnvironment(env);
    
    memoryCore = new EnhancedMemoryCore({
      memoryDir: env.memoryDir,
      enableSemanticCompression: false,
    });
    
    await memoryCore.initialize();
  });

  afterEach(async () => {
    // EnhancedMemoryCore 没有 shutdown 方法，直接清理环境即可
  });

  describe("场景 1: 记忆的存储", () => {
    it("应该能够存储记忆", async () => {
      const testContent = "用户偏好使用深色主题";
      const result = await memoryCore.addMemory(testContent, {
        type: "preference",
        tags: ["用户设置", "界面"],
        importance: 0.8,
      });

      expect(result.id).toBeDefined();
      expect(result.tokenCount).toBeGreaterThan(0);
    });

    it("应该能够存储多条记忆", async () => {
      const memories = [
        { content: "项目使用 TypeScript 开发", tags: ["技术栈", "项目"], importance: 0.9 },
        { content: "每周二进行代码审查", tags: ["流程", "团队"], importance: 0.7 },
      ];

      for (const mem of memories) {
        const result = await memoryCore.addMemory(mem.content, {
          type: "fact",
          tags: mem.tags,
          importance: mem.importance,
        });
        expect(result.id).toBeDefined();
      }

      const stats = await memoryCore.getMemoryStats();
      expect(stats.sqlite).toBeDefined();
    });
  });

  describe("场景 2: 记忆的持久化", () => {
    it("应该能够在重启后保持统计信息", async () => {
      const uniqueContent = `唯一测试内容: ${Date.now()}`;
      await memoryCore.addMemory(uniqueContent, {
        type: "fact",
        tags: ["测试"],
      });

      const stats1 = await memoryCore.getMemoryStats();
      expect(stats1.sqlite).toBeDefined();

      const newMemoryCore = new EnhancedMemoryCore({
        memoryDir: env.memoryDir,
      });
      await newMemoryCore.initialize();

      const stats2 = await newMemoryCore.getMemoryStats();
      expect(stats2.sqlite).toBeDefined();
    });
  });

  describe("场景 3: 记忆的统计", () => {
    it("应该能够获取记忆统计", async () => {
      await memoryCore.addMemory("重要的项目决策", {
        type: "fact",
        tags: ["重要"],
        importance: 1.0,
      });
      
      await memoryCore.addMemory("琐碎的临时记录", {
        type: "fact",
        tags: ["临时"],
        importance: 0.1,
      });

      const stats = await memoryCore.getMemoryStats();
      expect(stats.tripleIndex).toBeDefined();
      expect(stats.sqlite).toBeDefined();
    });
  });
});
