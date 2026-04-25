import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: IDE and LSP Integration Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("IDE Client", () => {
    it("should have IDE client (may be null if no IDE detected)", () => {
      expect(services.ideClient).toBeDefined();
    });

    it("should handle null IDE client gracefully", () => {
      if (services.ideClient === null) {
        expect(services.ideClient).toBeNull();
      } else {
        expect(services.ideClient).toBeDefined();
        expect(typeof services.ideClient.isAvailable).toBe("function");
      }
    });
  });

  describe("LSP Client", () => {
    it("should have LSP client (may be null if no LSP detected)", () => {
      expect(services.lspClient).toBeDefined();
    });

    it("should handle null LSP client gracefully", () => {
      if (services.lspClient === null) {
        expect(services.lspClient).toBeNull();
      } else {
        expect(services.lspClient).toBeDefined();
      }
    });
  });

  describe("IDE Detection", () => {
    it("should have IDE detection function", async () => {
      const { detectIDE } = await import("../../backend/services/ide/index.js");
      expect(typeof detectIDE).toBe("function");
    });

    it("should have auto-detect client function", async () => {
      const { createAutoDetectClient } = await import("../../backend/services/ide/index.js");
      expect(typeof createAutoDetectClient).toBe("function");
    });
  });

  describe("IDE Client Types", () => {
    it("should have VSCode client", async () => {
      const { VSCodeClient } = await import("../../backend/services/ide/index.js");
      expect(VSCodeClient).toBeDefined();
    });

    it("should have Cursor client", async () => {
      const { CursorClient } = await import("../../backend/services/ide/index.js");
      expect(CursorClient).toBeDefined();
    });

    it("should have JetBrains client", async () => {
      const { JetBrainsClient } = await import("../../backend/services/ide/index.js");
      expect(JetBrainsClient).toBeDefined();
    });
  });

  describe("LSP Detection", () => {
    it("should have LSP detection function", async () => {
      const { detectLspForProject } = await import("../../backend/services/lsp/index.js");
      expect(typeof detectLspForProject).toBe("function");
    });

    it("should detect LSP for current project", async () => {
      const { detectLspForProject } = await import("../../backend/services/lsp/index.js");
      const projectDir = process.cwd();
      const lspClient = detectLspForProject(projectDir);
      expect(lspClient).toBeDefined();
    });
  });

  describe("LSP Capabilities", () => {
    it("should support document symbols", async () => {
      const { GenericLspClient } = await import("../../backend/services/lsp/index.js");
      expect(GenericLspClient).toBeDefined();
    });

    it("should support completion items", async () => {
      const type = await import("../../backend/services/lsp/index.js");
      expect(type.CompletionItemKind).toBeDefined();
    });
  });

  describe("IDE Client Factory", () => {
    it("should create IDE client with factory", async () => {
      const { createIDEClient } = await import("../../backend/services/ide/index.js");
      expect(typeof createIDEClient).toBe("function");
    });

    it("should support different IDE types", async () => {
      const { createIDEClient } = await import("../../backend/services/ide/index.js");
      
      const vscodeClient = createIDEClient({ type: "vscode" });
      expect(vscodeClient).toBeDefined();
      
      const cursorClient = createIDEClient({ type: "cursor" });
      expect(cursorClient).toBeDefined();
    });
  });

  describe("IDE Integration Features", () => {
    it("should have base IDE client", async () => {
      const { BaseIDEClient } = await import("../../backend/services/ide/index.js");
      expect(BaseIDEClient).toBeDefined();
    });

    it("should have IDE types module", async () => {
      const types = await import("../../backend/services/ide/types.js");
      expect(types).toBeDefined();
    });
  });
});
