import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Plugin System Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Plugin Loading", () => {
    it("should have loaded plugins", () => {
      expect(services.loadedPlugins).toBeDefined();
    });

    it("should have enabled plugins", () => {
      expect(Array.isArray(services.loadedPlugins.enabled)).toBe(true);
    });

    it("should have disabled plugins", () => {
      expect(Array.isArray(services.loadedPlugins.disabled)).toBe(true);
    });

    it("should track plugin errors", () => {
      expect(Array.isArray(services.loadedPlugins.errors)).toBe(true);
    });
  });

  describe("Plugin Registry", () => {
    it("should get builtin plugins", async () => {
      const { getBuiltinPlugins } = await import("../../backend/plugins/index.js");
      const plugins = getBuiltinPlugins();
      expect(plugins).toBeDefined();
      expect(Array.isArray(plugins)).toBe(true);
    });

    it("should register builtin plugin", async () => {
      const { registerBuiltinPlugin } = await import("../../backend/plugins/index.js");
      
      const pluginDef = {
        name: `Test Plugin ${Date.now()}`,
        description: "A test plugin",
        version: "1.0.0",
      };

      registerBuiltinPlugin(pluginDef);
    });

    it("should get plugin by name", async () => {
      const { getPluginById, registerBuiltinPlugin } = await import("../../backend/plugins/index.js");
      
      const pluginName = `Get Plugin Test ${Date.now()}`;
      registerBuiltinPlugin({
        name: pluginName,
        description: "Test getting plugin by name",
        version: "1.0.0",
      });

      const plugin = getPluginById(pluginName);
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe(pluginName);
    });
  });

  describe("Plugin Metadata", () => {
    it("should have required plugin metadata for loaded plugins", () => {
      const allPlugins = [...services.loadedPlugins.enabled, ...services.loadedPlugins.disabled];
      
      for (const plugin of allPlugins) {
        expect(plugin.name).toBeDefined();
        expect(plugin.manifest).toBeDefined();
        expect(plugin.path).toBeDefined();
      }
    });

    it("should have manifest for loaded plugins", () => {
      const allPlugins = [...services.loadedPlugins.enabled, ...services.loadedPlugins.disabled];
      
      for (const plugin of allPlugins) {
        expect(plugin.manifest.name).toBeDefined();
      }
    });
  });

  describe("Builtin Plugin Definition", () => {
    it("should support skills in builtin plugins", async () => {
      const { registerBuiltinPlugin, getPluginById } = await import("../../backend/plugins/index.js");
      
      const pluginName = `Skills Plugin ${Date.now()}`;
      registerBuiltinPlugin({
        name: pluginName,
        description: "Plugin with skills",
        version: "1.0.0",
        skills: [
          {
            name: "test-skill",
            description: "A test skill",
          },
        ],
      });

      const plugin = getPluginById(pluginName);
      expect(plugin).toBeDefined();
    });

    it("should support hooks in builtin plugins", async () => {
      const { registerBuiltinPlugin, getPluginById } = await import("../../backend/plugins/index.js");
      
      const pluginName = `Hooks Plugin ${Date.now()}`;
      registerBuiltinPlugin({
        name: pluginName,
        description: "Plugin with hooks",
        version: "1.0.0",
        hooks: {
          PreToolUse: [
            {
              matcher: "*",
              hooks: [{ type: "shell", command: "echo test" }],
            },
          ],
        },
      });

      const plugin = getPluginById(pluginName);
      expect(plugin).toBeDefined();
    });
  });

  describe("Plugin Errors", () => {
    it("should handle plugin errors", async () => {
      const { getPluginErrorMessage } = await import("../../backend/plugins/types.js");
      
      const error = {
        type: "generic-error" as const,
        source: "test",
        error: "Test error",
      };

      const message = getPluginErrorMessage(error);
      expect(message).toContain("Test error");
    });
  });
});
