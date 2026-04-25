import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Configuration System Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Settings Loader", () => {
    it("should have settings loader initialized", () => {
      expect(services.settingsLoader).toBeDefined();
    });

    it("should get permission rules", () => {
      const rules = services.settingsLoader.getPermissionRules("userSettings");
      expect(rules).toBeDefined();
      expect(Array.isArray(rules)).toBe(true);
    });
  });

  describe("Layered Config Manager", () => {
    it("should have config manager initialized", () => {
      expect(services.configManager).toBeDefined();
    });

    it("should have layered sources", () => {
      const sources = services.configManager.getSources();
      expect(sources).toBeDefined();
      expect(Array.isArray(sources)).toBe(true);
    });
  });

  describe("Memory Truncator", () => {
    it("should have memory truncator initialized", () => {
      expect(services.memoryTruncator).toBeDefined();
    });
  });

  describe("Prompt Cache", () => {
    it("should have prompt cache initialized", () => {
      expect(services.promptCache).toBeDefined();
    });

    it("should cache prompts", async () => {
      const key = "test-prompt-key";
      const prompt = "Test prompt content";
      
      services.promptCache.set(key, prompt);
      const cached = services.promptCache.get(key);
      
      expect(cached).toBe(prompt);
    });

    it("should invalidate cached prompts", async () => {
      const key = "invalidatable-key";
      await services.promptCache.set(key, "content");
      
      services.promptCache.invalidate(key);
      const cached = services.promptCache.get(key);
      
      expect(cached).toBeUndefined();
    });

    it("should reset cache", async () => {
      services.promptCache.set("key1", "content1");
      services.promptCache.set("key2", "content2");
      
      services.promptCache.reset();
      
      expect(services.promptCache.get("key1")).toBeUndefined();
      expect(services.promptCache.get("key2")).toBeUndefined();
    });

    it("should compute cache key", () => {
      const key = services.promptCache.computeKey([{ role: "user", content: "test" }]);
      expect(key).toBeDefined();
      expect(typeof key).toBe("string");
    });

    it("should get cache economics", () => {
      const economics = services.promptCache.getEconomics();
      expect(economics).toBeDefined();
      expect(typeof economics.hitRate).toBe("number");
      expect(typeof economics.savedTokens).toBe("number");
    });
  });

  describe("Command Parser", () => {
    it("should have command parser initialized", () => {
      expect(services.commandParser).toBeDefined();
    });

    it("should parse simple commands", () => {
      const result = services.commandParser.parse("/help");
      expect(result).toBeDefined();
    });

    it("should parse commands with arguments", () => {
      const result = services.commandParser.parse("/search pattern");
      expect(result).toBeDefined();
    });

    it("should parse commands with flags", () => {
      const result = services.commandParser.parse("/test --verbose -f file.txt");
      expect(result).toBeDefined();
    });
  });

  describe("DI Container", () => {
    it("should have DI container initialized", () => {
      expect(services.diContainer).toBeDefined();
    });

    it("should register services", () => {
      services.diContainer.registerSingleton("testService", () => ({
        name: "test",
      }));

      const service = services.diContainer.get("testService");
      expect(service).toBeDefined();
      expect((service as { name: string }).name).toBe("test");
    });

    it("should get registered services", () => {
      const tools = services.diContainer.get("tools");
      expect(tools).toBeDefined();
    });

    it("should check if service is registered", () => {
      const hasTools = services.diContainer.has("tools");
      expect(hasTools).toBe(true);
    });
  });

  describe("Query Context Factory", () => {
    it("should have query context factory initialized", () => {
      expect(services.queryContextFactory).toBeDefined();
    });
  });
});
