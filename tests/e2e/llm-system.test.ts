import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { LLMConfigManager, LLMConfigSchema } from "../../backend/llm/config-manager.js";
import { LLMClient, LLMClientExtendedConfigSchema } from "../../backend/llm/client.js";
import { ProviderConfigSchema } from "../../backend/llm/types.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-llm-e2e-${Date.now()}`);

describe("E2E - LLM 配置管理系统完整场景", () => {
  let configManager: LLMConfigManager;
  let configDir: string;

  beforeEach(async () => {
    configDir = join(TEST_DIR, "config");
    await mkdir(configDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: 配置初始化", () => {
    it("应该能够创建新的配置管理器", async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      expect(configManager).toBeDefined();
    });

    it("空目录应该创建默认配置", async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.providers).toBeDefined();
    });

    it("应该能够加载现有配置", async () => {
      const testConfig = {
        version: "1.0",
        providers: {
          openai: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-test-123456789",
            defaultModel: "gpt-4",
            supportedModels: ["gpt-4", "gpt-3.5-turbo"],
            supportsStreaming: true,
            requiresThinkingFlag: false,
          },
          anthropic: {
            baseUrl: "https://api.anthropic.com/v1",
            apiKey: "sk-ant-test-123456789",
            defaultModel: "claude-3-opus-20240229",
            supportedModels: ["claude-3-opus-20240229", "claude-3-sonnet-20240229"],
            supportsStreaming: true,
            requiresThinkingFlag: false,
          },
        },
        defaultProvider: "openai",
        defaultModel: "gpt-4",
        fallbackProviders: ["anthropic"],
        budgetUsd: 50,
        maxLatencyMs: 10000,
      };

      await writeFile(
        join(configDir, "llm-config.json"),
        JSON.stringify(testConfig, null, 2)
      );

      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      const config = configManager.getConfig();
      expect(config.defaultProvider).toBe("openai");
      expect(config.defaultModel).toBe("gpt-4");
      expect(config.budgetUsd).toBe(50);
      expect(Object.keys(config.providers).length).toBe(2);
    });
  });

  describe("场景 2: 供应商配置管理", () => {
    beforeEach(async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();
    });

    it("应该能够添加新的供应商配置", async () => {
      await configManager.addProvider("test-provider", {
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test-123456789",
        defaultModel: "test-model",
        supportedModels: ["test-model", "test-model-large"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      });

      const config = configManager.getConfig();
      expect(config.providers["test-provider"]).toBeDefined();
      expect(config.providers["test-provider"].apiKey).toBe("sk-test-123456789");
    });

    it("应该能够更新供应商配置", async () => {
      await configManager.addProvider("update-test", {
        baseUrl: "https://api.example.com/v1",
        apiKey: "old-key",
        defaultModel: "old-model",
        supportedModels: ["old-model"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      });

      await configManager.removeProvider("update-test");
      await configManager.addProvider("update-test", {
        baseUrl: "https://api.example.com/v1",
        apiKey: "new-key-123456",
        defaultModel: "new-model",
        supportedModels: ["new-model", "new-model-large"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      });

      const config = configManager.getConfig();
      expect(config.providers["update-test"].apiKey).toBe("new-key-123456");
      expect(config.providers["update-test"].defaultModel).toBe("new-model");
    });

    it("应该能够删除供应商配置", async () => {
      await configManager.addProvider("delete-test", {
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test-123456789",
        defaultModel: "test-model",
        supportedModels: ["test-model"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      });

      await configManager.removeProvider("delete-test");

      const config = configManager.getConfig();
      expect(config.providers["delete-test"]).toBeUndefined();
    });

    it("应该能够获取所有供应商列表", async () => {
      for (let i = 1; i <= 3; i++) {
        await configManager.addProvider(`provider-${i}`, {
          baseUrl: "https://api.example.com/v1",
          apiKey: `sk-test-${i}`,
          defaultModel: `model-${i}`,
          supportedModels: [`model-${i}`],
          supportsStreaming: true,
          requiresThinkingFlag: false,
        });
      }

      const providers = configManager.getProviderKeys();
      expect(providers.length).toBe(3);
    });
  });

  describe("场景 3: 默认配置管理", () => {
    beforeEach(async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      for (let i = 1; i <= 3; i++) {
        await configManager.addProvider(`provider-${i}`, {
          baseUrl: "https://api.example.com/v1",
          apiKey: `sk-test-${i}`,
          defaultModel: `model-${i}`,
          supportedModels: [`model-${i}`],
          supportsStreaming: true,
          requiresThinkingFlag: false,
        });
      }
    });

    it("应该能够设置默认供应商", async () => {
      await configManager.setDefaultProvider("provider-2");

      const config = configManager.getConfig();
      expect(config.defaultProvider).toBe("provider-2");
    });

    it("应该能够设置默认模型", async () => {
      await configManager.setDefaultModel("provider-1", "model-1-custom");

      const config = configManager.getConfig();
      expect(config.defaultModel).toBe("model-1-custom");
    });

    it("应该能够设置后备供应商", async () => {
      await configManager.setFallbackProviders(["provider-2", "provider-3"]);

      const config = configManager.getConfig();
      expect(config.fallbackProviders).toEqual(["provider-2", "provider-3"]);
    });
  });

  describe("场景 4: 预算管理", () => {
    beforeEach(async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();
    });

    it("应该能够设置预算", async () => {
      await configManager.setBudget(100);

      const config = configManager.getConfig();
      expect(config.budgetUsd).toBe(100);
    });

    it("应该能够获取配置", async () => {
      await configManager.setBudget(50);
      const config = configManager.getConfig();

      expect(config.budgetUsd).toBe(50);
    });
  });

  describe("场景 5: 模型别名管理", () => {
    beforeEach(async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();
    });

    it("应该能够添加模型别名", async () => {
      await configManager.setModelAlias("fast", "gpt-3.5-turbo");
      await configManager.setModelAlias("smart", "gpt-4");

      const config = configManager.getConfig();
      expect(config.modelAliases?.["fast"]).toBe("gpt-3.5-turbo");
      expect(config.modelAliases?.["smart"]).toBe("gpt-4");
    });

    it("应该能够解析模型别名", async () => {
      await configManager.setModelAlias("fast", "gpt-3.5-turbo");

      const resolved = configManager.resolveModelAlias("fast");
      expect(resolved).toBe("gpt-3.5-turbo");
    });

    it("解析不存在的别名应该返回原值", async () => {
      const resolved = configManager.resolveModelAlias("unknown-model");
      expect(resolved).toBe("unknown-model");
    });

    it("应该能够删除模型别名", async () => {
      await configManager.setModelAlias("test", "test-model");
      await configManager.removeModelAlias("test");

      const config = configManager.getConfig();
      expect(config.modelAliases?.["test"]).toBeUndefined();
    });

    it("应该能够解析带覆盖的模型", async () => {
      await configManager.setModelAlias("fast", "base-model");
      await configManager.setModelOverride("base-model", "overridden-model");

      const resolved = configManager.resolveModelWithOverrides("fast");
      expect(resolved).toBe("overridden-model");
    });
  });

  describe("场景 6: 配置持久化", () => {
    it("配置更改应该保存到文件", async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      await configManager.addProvider("persist-test", {
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test-persist",
        defaultModel: "test-model",
        supportedModels: ["test-model"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      });

      await configManager.setDefaultProvider("persist-test");
      await configManager.save();

      const newManager = new LLMConfigManager(configDir);
      await newManager.initialize();

      const config = newManager.getConfig();
      expect(config.providers["persist-test"]).toBeDefined();
      expect(config.defaultProvider).toBe("persist-test");
    });

    it("应该能够处理并发配置更改", async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      const operations = [];
      for (let i = 1; i <= 5; i++) {
        operations.push(
          configManager.addProvider(`concurrent-${i}`, {
            baseUrl: "https://api.example.com/v1",
            apiKey: `sk-concurrent-${i}`,
            defaultModel: `model-${i}`,
            supportedModels: [`model-${i}`],
            supportsStreaming: true,
            requiresThinkingFlag: false,
          })
        );
      }

      await Promise.all(operations);
      await configManager.save();

      const config = configManager.getConfig();
      expect(Object.keys(config.providers).length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("场景 7: 配置验证", () => {
    beforeEach(async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();
    });

    it("应该能够验证有效的配置", () => {
      const config = {
        providers: {},
        defaultProvider: "test",
        defaultModel: "test-model",
        fallbackProviders: [],
      };

      const result = LLMConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("应该能够检测无效的配置", () => {
      const invalidConfig = {
        providers: "not-an-object",
        defaultProvider: 123,
        defaultModel: true,
        fallbackProviders: "not-an-array",
      };

      const result = LLMConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it("应该能够验证供应商配置", () => {
      const validProvider = {
        name: "test",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test-123456",
        defaultModel: "test-model",
        supportedModels: ["test-model"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      };

      const result = ProviderConfigSchema.safeParse(validProvider);
      expect(result.success).toBe(true);
    });

    it("应该能够检测无效的供应商配置", () => {
      const invalidProvider = {
        name: "",
        baseUrl: 123,
        apiKey: 456,
        defaultModel: null,
        supportedModels: "not-an-array",
        supportsStreaming: "not-boolean",
        requiresThinkingFlag: "not-boolean",
      };

      const result = ProviderConfigSchema.safeParse(invalidProvider);
      expect(result.success).toBe(false);
    });
  });

  describe("场景 8: 错误处理", () => {
    it("加载损坏的配置文件应该恢复到默认值", async () => {
      await writeFile(join(configDir, "llm-config.json"), "invalid json content");

      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.providers).toBeDefined();
    });

    it("设置不存在的供应商为默认应该抛出错误", async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      try {
        await configManager.setDefaultProvider("nonexistent");
        expect(false).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("删除不存在的供应商不应该抛出错误", async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      try {
        await configManager.removeProvider("nonexistent");
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });

    it("检查供应商是否存在应该正确返回", async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();

      expect(configManager.hasProvider("nonexistent")).toBe(false);

      await configManager.addProvider("existing", {
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test-123456",
        defaultModel: "test-model",
        supportedModels: ["test-model"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      });

      expect(configManager.hasProvider("existing")).toBe(true);
    });
  });

  describe("场景 9: 模型覆盖管理", () => {
    beforeEach(async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();
    });

    it("应该能够添加模型覆盖", async () => {
      await configManager.setModelOverride("source-model", "target-model");

      const config = configManager.getConfig();
      expect(config.modelOverrides?.["source-model"]).toBe("target-model");
    });

    it("应该能够删除模型覆盖", async () => {
      await configManager.setModelOverride("source-model", "target-model");
      await configManager.removeModelOverride("source-model");

      const config = configManager.getConfig();
      expect(config.modelOverrides?.["source-model"]).toBeUndefined();
    });
  });

  describe("场景 10: 可用模型管理", () => {
    beforeEach(async () => {
      configManager = new LLMConfigManager(configDir);
      await configManager.initialize();
    });

    it("应该能够设置可用模型", async () => {
      const models = ["model-a", "model-b", "model-c"];
      await configManager.setAvailableModels(models);

      const config = configManager.getConfig();
      expect(config.availableModels).toEqual(models);
    });

    it("空可用模型列表应该允许所有模型", async () => {
      await configManager.setAvailableModels([]);

      expect(configManager.isModelAllowed("any-model")).toBe(true);
    });

    it("应该能够检查模型是否被允许", async () => {
      await configManager.setAvailableModels(["allowed-model-1", "allowed-model-2"]);

      expect(configManager.isModelAllowed("allowed-model-1")).toBe(true);
      expect(configManager.isModelAllowed("allowed-model-2")).toBe(true);
      expect(configManager.isModelAllowed("disallowed-model")).toBe(false);
    });
  });
});

describe("E2E - LLM 客户端完整场景", () => {
  describe("场景 1: 客户端配置验证", () => {
    it("应该能够验证有效的客户端配置", () => {
      const providerConfig = ProviderConfigSchema.parse({
        name: "test-provider",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test-123456789",
        defaultModel: "test-model",
        supportedModels: ["test-model"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      });

      const validConfig = {
        providerConfig,
        provider: "test-provider",
        model: "test-model",
        maxTokens: 4096,
        temperature: 0.7,
        timeout: 30000,
        enableTranscript: false,
      };

      const result = LLMClientExtendedConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("应该能够验证带重试配置的客户端配置", () => {
      const providerConfig = ProviderConfigSchema.parse({
        name: "retry-test",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test-123456789",
        defaultModel: "test-model",
        supportedModels: ["test-model"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      });

      const clientConfig = {
        providerConfig,
        retryConfig: {
          maxRetries: 5,
          initialDelayMs: 100,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
        },
        enableTranscript: false,
      };

      const result = LLMClientExtendedConfigSchema.safeParse(clientConfig);
      expect(result.success).toBe(true);
    });
  });

  describe("场景 2: 客户端配置边界验证", () => {
    it("应该能够验证有效的客户端配置", () => {
      const providerConfig = ProviderConfigSchema.parse({
        name: "test",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test-123456",
        defaultModel: "test-model",
        supportedModels: ["test-model"],
        supportsStreaming: true,
        requiresThinkingFlag: false,
      });

      const validConfig = {
        providerConfig,
        provider: "test",
        model: "test-model",
        maxTokens: 4096,
        temperature: 0.7,
      };

      const result = LLMClientExtendedConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it("应该能够检测无效的客户端配置", () => {
      const invalidConfig = {
        providerConfig: null,
        maxTokens: "not-a-number",
        temperature: "not-a-number",
      };

      const result = LLMClientExtendedConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });
});
