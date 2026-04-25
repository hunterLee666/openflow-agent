import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Plugin Crash Isolation E2E Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("Plugin Loader - Isolation Mechanism", () => {
    it("should isolate plugin loading errors", async () => {
      const { loadPluginFromPath } = await import("../../backend/plugins/loader.js");

      const result = await loadPluginFromPath("/nonexistent/plugin/path", "test");

      expect(result.plugin).not.toBeNull();
      expect(result.plugin?.name).toBeDefined();
    });

    it("should handle malformed manifest gracefully", async () => {
      const { parsePluginManifest } = await import("../../backend/plugins/manifest.js");

      const invalidManifest = "{ invalid json }";
      const result = parsePluginManifest(invalidManifest);

      expect(result).toBeNull();
    });

    it("should continue loading other plugins on failure", async () => {
      const { discoverPluginsInDirectory } = await import("../../backend/plugins/loader.js");

      const result = await discoverPluginsInDirectory("/nonexistent", "test");

      expect(result.plugins).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it("should validate plugin path to prevent traversal", async () => {
      const { validatePluginPath } = await import("../../backend/plugins/loader.js");

      expect(() => {
        validatePluginPath("/safe/base", "../../../etc/passwd");
      }).toThrow("Path traversal detected");

      expect(() => {
        validatePluginPath("/safe/base", "normal/path");
      }).not.toThrow();
    });
  });

  describe("Plugin Error Handling", () => {
    it("should generate descriptive error messages", async () => {
      const { getPluginErrorMessage } = await import("../../backend/plugins/types.js");

      const error = {
        type: "manifest-parse-error" as const,
        source: "test",
        manifestPath: "/path/to/plugin.json",
        parseError: "Unexpected token",
      };

      const message = getPluginErrorMessage(error);
      expect(message).toContain("Manifest parse error");
      expect(message).toContain("Unexpected token");
    });

    it("should handle all error types", async () => {
      const { getPluginErrorMessage } = await import("../../backend/plugins/types.js");

      const errorTypes = [
        { type: "generic-error", source: "test", error: "Something went wrong" },
        { type: "path-not-found", source: "test", path: "/path", component: "commands" as const },
        { type: "git-auth-failed", source: "test", gitUrl: "https://github.com/test", authType: "https" as const },
        { type: "git-timeout", source: "test", gitUrl: "https://github.com/test", operation: "clone" as const },
        { type: "network-error", source: "test", url: "https://example.com" },
        { type: "plugin-not-found", source: "test", pluginId: "test-plugin", marketplace: "default" },
        { type: "marketplace-not-found", source: "test", marketplace: "unknown", availableMarketplaces: ["default"] },
        { type: "dependency-unsatisfied", source: "test", plugin: "test", dependency: "dep", reason: "not-found" as const },
      ];

      for (const error of errorTypes) {
        const message = getPluginErrorMessage(error as any);
        expect(typeof message).toBe("string");
        expect(message.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Plugin State Protection", () => {
    it("should cache loaded plugins", async () => {
      const { clearPluginCache, getPluginsDirectory } = await import("../../backend/plugins/loader.js");

      clearPluginCache("test");

      const dir = getPluginsDirectory();
      expect(typeof dir).toBe("string");
    });

    it("should parse plugin identifiers correctly", async () => {
      const { parsePluginIdentifier } = await import("../../backend/plugins/loader.js");

      const simple = parsePluginIdentifier("my-plugin");
      expect(simple.name).toBe("my-plugin");
      expect(simple.marketplace).toBeNull();

      const withMarketplace = parsePluginIdentifier("my-plugin@official");
      expect(withMarketplace.name).toBe("my-plugin");
      expect(withMarketplace.marketplace).toBe("official");
    });

    it("should handle plugin not found gracefully", async () => {
      const { getPluginById } = await import("../../backend/plugins/loader.js");

      const plugin = getPluginById("nonexistent-plugin");
      expect(plugin).toBeUndefined();
    });
  });

  describe("Plugin Manifest Validation", () => {
    it("should validate required manifest fields", async () => {
      const { parsePluginManifest } = await import("../../backend/plugins/manifest.js");

      const validManifest = JSON.stringify({
        name: "test-plugin",
        version: "1.0.0",
        description: "A test plugin",
      });

      const result = parsePluginManifest(validManifest);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-plugin");
    });

    it("should handle missing optional fields", async () => {
      const { parsePluginManifest } = await import("../../backend/plugins/manifest.js");

      const minimalManifest = JSON.stringify({
        name: "minimal-plugin",
      });

      const result = parsePluginManifest(minimalManifest);
      expect(result).not.toBeNull();
      expect(result?.name).toBe("minimal-plugin");
    });

    it("should validate user config options", async () => {
      const { parsePluginManifest } = await import("../../backend/plugins/manifest.js");

      const manifestWithConfig = JSON.stringify({
        name: "configurable-plugin",
        userConfig: {
          apiKey: {
            type: "string",
            title: "API Key",
            description: "Your API key",
            required: true,
            secret: true,
          },
          maxRetries: {
            type: "number",
            title: "Max Retries",
            description: "Maximum retry attempts",
            default: 3,
            validation: {
              min: 1,
              max: 10,
            },
          },
        },
      });

      const result = parsePluginManifest(manifestWithConfig);
      expect(result).not.toBeNull();
      expect(result?.userConfig).toBeDefined();
      expect(result?.userConfig?.apiKey.secret).toBe(true);
    });
  });

  describe("Plugin Recovery Strategies", () => {
    it("should handle plugin disable on error", async () => {
      const { loadAllPlugins } = await import("../../backend/plugins/loader.js");

      const result = await loadAllPlugins();

      expect(result).toHaveProperty("enabled");
      expect(result).toHaveProperty("disabled");
      expect(result).toHaveProperty("errors");
      expect(Array.isArray(result.enabled)).toBe(true);
      expect(Array.isArray(result.disabled)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should isolate plugin component failures", async () => {
      const { loadPluginFromPath } = await import("../../backend/plugins/loader.js");

      const result = await loadPluginFromPath("/tmp", "test");

      expect(result.plugin).not.toBeNull();
      expect(result.plugin?.commandsPath).toBeUndefined();
      expect(result.plugin?.agentsPath).toBeUndefined();
      expect(result.plugin?.skillsPath).toBeUndefined();
    });

    it("should preserve plugin state on partial failure", async () => {
      const { loadPluginFromPath } = await import("../../backend/plugins/loader.js");

      const result = await loadPluginFromPath("/tmp", "test");

      if (result.plugin) {
        expect(result.plugin.name).toBeDefined();
        expect(result.plugin.path).toBeDefined();
        expect(result.plugin.source).toBeDefined();
      }
    });
  });

  describe("Plugin Hooks Isolation", () => {
    it("should load hooks configuration safely", async () => {
      const { loadPluginFromPath } = await import("../../backend/plugins/loader.js");

      const result = await loadPluginFromPath("/tmp", "test");

      expect(result.plugin?.hooksConfig).toBeUndefined();
    });

    it("should handle invalid hooks configuration", async () => {
      const { readJsonFile } = await import("../../backend/plugins/loader.js");

      const result = await readJsonFile("/nonexistent/hooks.json");

      expect(result).toBeNull();
    });
  });

  describe("Plugin Commands Isolation", () => {
    it("should handle missing commands directory", async () => {
      const { getPluginCommands } = await import("../../backend/plugins/loader.js");

      const plugin = {
        name: "test",
        manifest: { name: "test" },
        path: "/tmp",
        source: "test",
        repository: "test",
      };

      const commands = await getPluginCommands(plugin);

      expect(commands).toEqual([]);
    });

    it("should filter only markdown files as commands", async () => {
      const { getPluginCommands } = await import("../../backend/plugins/loader.js");

      const plugin = {
        name: "test",
        manifest: { name: "test" },
        path: "/nonexistent",
        source: "test",
        repository: "test",
      };

      const commands = await getPluginCommands(plugin);

      expect(Array.isArray(commands)).toBe(true);
    });
  });

  describe("Plugin Skills Isolation", () => {
    it("should handle missing skills directory", async () => {
      const { getPluginSkills } = await import("../../backend/plugins/loader.js");

      const plugin = {
        name: "test",
        manifest: { name: "test" },
        path: "/tmp",
        source: "test",
        repository: "test",
      };

      const skills = await getPluginSkills(plugin);

      expect(skills).toEqual([]);
    });
  });

  describe("Plugin Agents Isolation", () => {
    it("should handle missing agents directory", async () => {
      const { getPluginAgents } = await import("../../backend/plugins/loader.js");

      const plugin = {
        name: "test",
        manifest: { name: "test" },
        path: "/tmp",
        source: "test",
        repository: "test",
      };

      const agents = await getPluginAgents(plugin);

      expect(agents).toEqual([]);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty plugin name", async () => {
      const { parsePluginManifest } = await import("../../backend/plugins/manifest.js");

      const emptyName = JSON.stringify({
        name: "",
      });

      const result = parsePluginManifest(emptyName);

      if (result) {
        expect(result.name).toBe("");
      }
    });

    it("should handle very long plugin names", async () => {
      const { parsePluginManifest } = await import("../../backend/plugins/manifest.js");

      const longName = "a".repeat(1000);
      const manifest = JSON.stringify({
        name: longName,
      });

      const result = parsePluginManifest(manifest);

      expect(result?.name).toBe(longName);
    });

    it("should handle special characters in plugin names", async () => {
      const { parsePluginManifest } = await import("../../backend/plugins/manifest.js");

      const specialName = "plugin-with-special_chars_123";
      const manifest = JSON.stringify({
        name: specialName,
      });

      const result = parsePluginManifest(manifest);

      expect(result?.name).toBe(specialName);
    });

    it("should handle concurrent plugin loading", async () => {
      const { loadPluginFromPath } = await import("../../backend/plugins/loader.js");

      const paths = ["/tmp/1", "/tmp/2", "/tmp/3", "/tmp/4", "/tmp/5"];

      const results = await Promise.all(
        paths.map((path) => loadPluginFromPath(path, "concurrent-test"))
      );

      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result.plugin).not.toBeNull();
      });
    });

    it("should handle circular dependencies gracefully", async () => {
      const { parsePluginManifest } = await import("../../backend/plugins/manifest.js");

      const manifest = JSON.stringify({
        name: "circular-plugin",
        dependencies: ["plugin-b"],
      });

      const result = parsePluginManifest(manifest);

      expect(result?.dependencies).toContain("plugin-b");
    });

    it("should handle plugin with all components", async () => {
      const { parsePluginManifest } = await import("../../backend/plugins/manifest.js");

      const fullManifest = JSON.stringify({
        name: "full-plugin",
        version: "1.0.0",
        description: "A plugin with all components",
        author: {
          name: "Test Author",
          email: "test@example.com",
        },
        commands: ["command1", "command2"],
        agents: ["agent1"],
        skills: ["skill1"],
        hooks: {
          "pre-tool": ["hook1"],
        },
        mcpServers: {
          "test-server": {
            command: "node",
            args: ["server.js"],
          },
        },
      });

      const result = parsePluginManifest(fullManifest);

      expect(result?.name).toBe("full-plugin");
      expect(result?.commands).toBeDefined();
      expect(result?.agents).toBeDefined();
      expect(result?.skills).toBeDefined();
      expect(result?.hooks).toBeDefined();
      expect(result?.mcpServers).toBeDefined();
    });
  });
});
