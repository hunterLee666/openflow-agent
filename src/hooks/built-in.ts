import type { RegisteredHook, HookDecision } from "./types.js";

export function createBuiltInHooks(): RegisteredHook[] {
  return [
    // Block dangerous commands
    {
      id: "block-rm-rf",
      event: "PreToolUse",
      matcher: { type: "exact", name: "bash" },
      priority: 1,
      callback: async (payload) => {
        const cmd = (payload.input?.command as string) || "";
        if (/rm\s+-rf\s+\//.test(cmd) || /rm\s+-rf\s+~/.test(cmd)) {
          return { type: "block", reason: "Dangerous command blocked: rm -rf on root/home" };
        }
        return { type: "allow" };
      },
    },
    // Audit MCP tools
    {
      id: "audit-mcp",
      event: "PreToolUse",
      matcher: { type: "prefix", value: "mcp__" },
      priority: 5,
      callback: async (payload) => {
        console.log(`[AUDIT] MCP tool called: ${payload.tool} at ${new Date().toISOString()}`);
        return { type: "allow" };
      },
    },
    // Block high-risk operations without explicit confirmation
    {
      id: "block-high-risk",
      event: "PreToolUse",
      matcher: { type: "risk", minLevel: "high" },
      priority: 1,
      callback: async (payload) => {
        if (payload.risk?.level === "critical") {
          return {
            type: "block",
            reason: `Critical risk operation blocked: ${payload.risk.description}`,
          };
        }
        return { type: "allow" };
      },
    },
    // Log all tool usage
    {
      id: "log-tool-use",
      event: "PostToolUse",
      matcher: { type: "all" },
      priority: 100,
      callback: async (payload) => {
        // Silent logging - could write to file
        return { type: "allow" };
      },
    },
  ];
}
