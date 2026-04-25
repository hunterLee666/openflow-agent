import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, getSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Command Processing Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Command Registry", () => {
    it("should list all registered commands", () => {
      const commands = services.commandRegistry.list();
      expect(commands.length).toBeGreaterThan(0);
    });

    it("should have help command registered", () => {
      const commands = services.commandRegistry.list();
      const helpCommand = commands.find(c => c.name === "help");
      expect(helpCommand).toBeDefined();
    });
  });

  describe("Command Execution", () => {
    it("should execute /help command", async () => {
      const result = await services.commandRegistry.execute("/help", {
        cwd: process.cwd(),
      });
      
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
    });

    it("should execute /status command", async () => {
      const result = await services.commandRegistry.execute("/status", {
        cwd: process.cwd(),
      });
      
      expect(result).toBeDefined();
    });

    it("should return error for unknown command", async () => {
      const result = await services.commandRegistry.execute("/unknown_command_xyz", {
        cwd: process.cwd(),
      });
      
      expect(result).toContain("Unknown command");
    });
  });

  describe("Command Alias Manager", () => {
    it("should have alias manager initialized", () => {
      expect(services.aliasManager).toBeDefined();
    });

    it("should register and get alias", () => {
      services.aliasManager.register({
        name: "test_alias",
        expansion: "/help",
        description: "Test alias",
      });

      const alias = services.aliasManager.get("test_alias");
      expect(alias).toBeDefined();
      expect(alias?.expansion).toBe("/help");
    });
  });

  describe("Command Parser", () => {
    it("should have command parser initialized", () => {
      expect(services.commandParser).toBeDefined();
    });
  });

  describe("Command Completer", () => {
    it("should have command completer initialized", () => {
      expect(services.commandCompleter).toBeDefined();
    });

    it("should complete partial commands", () => {
      const completions = services.commandCompleter.complete({
        input: "/hel",
        cursorPosition: 4,
        currentWord: "/hel",
        currentWordStart: 0,
        fullCommand: "/hel",
        args: [],
        flags: {},
      });
      expect(completions).toBeDefined();
    });
  });
});
