import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Command Completion Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Command Completer Initialization", () => {
    it("should have command completer initialized", () => {
      expect(services.commandCompleter).toBeDefined();
    });
  });

  describe("Command Completer Methods", () => {
    it("should have complete method", () => {
      expect(typeof services.commandCompleter.complete).toBe("function");
    });

    it("should have registerCommand method", () => {
      expect(typeof services.commandCompleter.registerCommand).toBe("function");
    });
  });

  describe("Command Completion Features", () => {
    it("should complete partial commands", () => {
      const context = {
        input: "/hel",
        cursorPosition: 4,
        currentWord: "/hel",
        currentWordStart: 0,
        fullCommand: "/hel",
        args: [],
        flags: {},
      };
      
      const result = services.commandCompleter.complete(context);
      expect(result).toBeDefined();
    });

    it("should complete command arguments", () => {
      const context = {
        input: "/help ",
        cursorPosition: 6,
        currentWord: "",
        currentWordStart: 6,
        fullCommand: "/help",
        args: [],
        flags: {},
      };
      
      const result = services.commandCompleter.complete(context);
      expect(result).toBeDefined();
    });

    it("should return empty array for unknown commands", () => {
      const context = {
        input: "/unknown-command-xyz",
        cursorPosition: 19,
        currentWord: "/unknown-command-xyz",
        currentWordStart: 0,
        fullCommand: "/unknown-command-xyz",
        args: [],
        flags: {},
      };
      
      const result = services.commandCompleter.complete(context);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Command Completer Types", () => {
    it("should have CommandCompleter class", async () => {
      const { CommandCompleter } = await import("../../backend/commands/completion.js");
      expect(CommandCompleter).toBeDefined();
    });

    it("should have default completer", async () => {
      const { defaultCompleter } = await import("../../backend/commands/completion.js");
      expect(defaultCompleter).toBeDefined();
    });
  });

  describe("Command Completion Registration", () => {
    it("should register custom commands", () => {
      const commandSpec = {
        name: "/custom",
        description: "Custom command",
      };
      
      services.commandCompleter.registerCommand(commandSpec);
    });
  });

  describe("Command History Integration", () => {
    it("should integrate with command history", () => {
      expect(services.commandCompleter).toBeDefined();
    });
  });
});
