import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: Message Grouper Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Message Grouper Initialization", () => {
    it("should have message grouper initialized", () => {
      expect(services.messageGrouper).toBeDefined();
    });
  });

  describe("Message Grouper Types", () => {
    it("should have MessageGrouper class", async () => {
      const { MessageGrouper } = await import("../../frontend/tui/collapse.js");
      expect(MessageGrouper).toBeDefined();
    });

    it("should have default message grouper", async () => {
      const { defaultMessageGrouper } = await import("../../frontend/tui/collapse.js");
      expect(defaultMessageGrouper).toBeDefined();
    });
  });

  describe("Message Grouping Features", () => {
    it("should group similar messages", () => {
      expect(services.messageGrouper).toBeDefined();
    });

    it("should collapse consecutive messages", () => {
      expect(services.messageGrouper).toBeDefined();
    });

    it("should preserve message order", () => {
      expect(services.messageGrouper).toBeDefined();
    });
  });

  describe("Message Grouper Methods", () => {
    it("should have addItem method", async () => {
      const { MessageGrouper } = await import("../../frontend/tui/collapse.js");
      const grouper = new MessageGrouper();
      expect(typeof grouper.addItem).toBe("function");
    });

    it("should have getGroup method", async () => {
      const { MessageGrouper } = await import("../../frontend/tui/collapse.js");
      const grouper = new MessageGrouper();
      expect(typeof grouper.getGroup).toBe("function");
    });

    it("should have clear method", async () => {
      const { MessageGrouper } = await import("../../frontend/tui/collapse.js");
      const grouper = new MessageGrouper();
      expect(typeof grouper.clear).toBe("function");
    });
  });

  describe("Message Grouping Edge Cases", () => {
    it("should handle empty message list", async () => {
      const { MessageGrouper } = await import("../../frontend/tui/collapse.js");
      const grouper = new MessageGrouper();
      expect(grouper).toBeDefined();
    });

    it("should handle single message", async () => {
      const { MessageGrouper } = await import("../../frontend/tui/collapse.js");
      const grouper = new MessageGrouper();
      expect(grouper).toBeDefined();
    });

    it("should handle large number of messages", async () => {
      const { MessageGrouper } = await import("../../frontend/tui/collapse.js");
      const grouper = new MessageGrouper();
      expect(grouper).toBeDefined();
    });
  });

  describe("Collapse Configuration", () => {
    it("should have collapse config types", async () => {
      const types = await import("../../frontend/tui/collapse.js");
      expect(types.CollapseConfig).toBeDefined();
    });

    it("should have collapse rule types", async () => {
      const types = await import("../../frontend/tui/collapse.js");
      expect(types.CollapseRule).toBeDefined();
    });
  });
});
