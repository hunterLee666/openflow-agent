import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Config Hot Reload Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Config Manager Initialization", () => {
    it("should have config manager initialized", () => {
      expect(services.configManager).toBeDefined();
    });

    it("should have settings loader initialized", () => {
      expect(services.settingsLoader).toBeDefined();
    });
  });

  describe("Config Manager Types", () => {
    it("should have LayeredConfigManager class", async () => {
      const { LayeredConfigManager } = await import("../../backend/config/index.js");
      expect(LayeredConfigManager).toBeDefined();
    });

    it("should have ConfigHotReloader class", async () => {
      const { ConfigHotReloader } = await import("../../backend/config/index.js");
      expect(ConfigHotReloader).toBeDefined();
    });

    it("should have SettingsLoader class", async () => {
      const { SettingsLoader } = await import("../../backend/config/index.js");
      expect(SettingsLoader).toBeDefined();
    });
  });

  describe("Layered Config Manager Methods", () => {
    it("should have get method", async () => {
      const { LayeredConfigManager } = await import("../../backend/config/hot-reload.js");
      const manager = new LayeredConfigManager("/tmp", false);
      expect(typeof manager.get).toBe("function");
    });

    it("should have set method", async () => {
      const { LayeredConfigManager } = await import("../../backend/config/hot-reload.js");
      const manager = new LayeredConfigManager("/tmp", false);
      expect(typeof manager.set).toBe("function");
    });

    it("should have getAll method", async () => {
      const { LayeredConfigManager } = await import("../../backend/config/hot-reload.js");
      const manager = new LayeredConfigManager("/tmp", false);
      expect(typeof manager.getAll).toBe("function");
    });
  });

  describe("Config Hot Reloader Methods", () => {
    it("should have watch method", async () => {
      const { ConfigHotReloader } = await import("../../backend/config/hot-reload.js");
      const reloader = new ConfigHotReloader("/tmp", {});
      expect(typeof reloader.watch).toBe("function");
    });
  });

  describe("Settings Loader Methods", () => {
    it("should have load method", async () => {
      const { SettingsLoader } = await import("../../backend/config/index.js");
      const loader = new SettingsLoader("/tmp", "/tmp");
      expect(typeof loader.load).toBe("function");
    });

    it("should have getPermissionRules method", async () => {
      const { SettingsLoader } = await import("../../backend/config/index.js");
      const loader = new SettingsLoader("/tmp", "/tmp");
      expect(typeof loader.getPermissionRules).toBe("function");
    });
  });

  describe("Config Change Events", () => {
    it("should have ConfigChangeEvent type exported", async () => {
      const types = await import("../../backend/config/hot-reload.js");
      expect(types.ConfigChangeEvent).toBeDefined();
    });

    it("should have LayeredConfigSource type exported", async () => {
      const types = await import("../../backend/config/hot-reload.js");
      expect(types.LayeredConfigSource).toBeDefined();
    });
  });

  describe("Layered Config Behavior", () => {
    it("should set and get config values", async () => {
      const { LayeredConfigManager } = await import("../../backend/config/hot-reload.js");
      const manager = new LayeredConfigManager("/tmp", false);
      manager.set("test.key", "test-value");
      const value = manager.get("test.key");
      expect(value).toBe("test-value");
    });

    it("should return undefined for non-existent key", async () => {
      const { LayeredConfigManager } = await import("../../backend/config/hot-reload.js");
      const manager = new LayeredConfigManager("/tmp", false);
      const value = manager.get("non.existent.key");
      expect(value).toBeUndefined();
    });

    it("should return all config values", async () => {
      const { LayeredConfigManager } = await import("../../backend/config/hot-reload.js");
      const manager = new LayeredConfigManager("/tmp", false);
      manager.set("key1", "value1");
      manager.set("key2", "value2");
      const all = manager.getAll();
      expect(all).toBeDefined();
    });
  });

  describe("Hot Reload Event Emitter", () => {
    it("should extend EventEmitter", async () => {
      const { ConfigHotReloader } = await import("../../backend/config/hot-reload.js");
      const reloader = new ConfigHotReloader("/tmp", {});
      expect(typeof reloader.on).toBe("function");
      expect(typeof reloader.emit).toBe("function");
    });
  });
});
