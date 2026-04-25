import { describe, test, expect } from "bun:test";
import { buildTier3SummaryPrompt, formatTier3Summary } from "../../../refactored/core/compaction/tier3.js";
import type { Tier3Summary } from "../../../refactored/core/compaction/tier3.js";

describe("Tier3 Structured Summary", () => {
  test("should build tier3 summary prompt", () => {
    const messages = [
      { role: "user", content: "Help me fix a bug in my code" },
      { role: "assistant", content: "I'll help you. What's the error?" },
      { role: "user", content: "TypeError: Cannot read property 'x' of undefined" },
    ];

    const prompt = buildTier3SummaryPrompt(messages);
    expect(prompt).toContain("INTENT");
    expect(prompt).toContain("CONCEPTS");
    expect(prompt).toContain("FILES");
    expect(prompt).toContain("ERRORS");
    expect(prompt).toContain("TypeError: Cannot read property 'x' of undefined");
  });

  test("should format tier3 summary", () => {
    const summary: Tier3Summary = {
      intent: "Fix TypeError in user authentication module",
      concepts: ["undefined property access", "null safety"],
      files: [
        { path: "src/auth.ts", note: "Main authentication logic" },
        { path: "src/types.ts", note: "Type definitions" },
      ],
      errors: [
        { title: "TypeError", repro: "Access user.profile.x when profile is undefined" },
      ],
      messageHighlights: ["Cannot read property 'x' of undefined"],
      tasks: [
        { id: "1", done: false, text: "Add null check for user.profile" },
        { id: "2", done: false, text: "Update type definitions" },
      ],
      currentFocus: "Add null safety check in auth.ts",
      environment: "Node: v18.0.0\nBranch: main",
      strippedCoT: { keptConclusions: ["Profile can be undefined", "Need null check before access"] },
    };

    const formatted = formatTier3Summary(summary);
    expect(formatted).toContain("## Tier3 Context Summary");
    expect(formatted).toContain("Fix TypeError in user authentication module");
    expect(formatted).toContain("src/auth.ts");
    expect(formatted).toContain("TypeError");
    expect(formatted).toContain("[ ] Add null check for user.profile");
  });

  test("should handle empty messages", () => {
    const messages: Array<{ role: string; content: unknown }> = [];
    const prompt = buildTier3SummaryPrompt(messages);
    expect(prompt).toBeDefined();
    expect(prompt.length).toBeGreaterThan(0);
  });

  test("should handle complex content types", () => {
    const messages = [
      { role: "user", content: "Fix this" },
      { role: "assistant", content: [{ type: "text", text: "Sure" }] },
    ];

    const prompt = buildTier3SummaryPrompt(messages);
    expect(prompt).toContain("Fix this");
    expect(prompt).toContain("Sure");
  });
});
