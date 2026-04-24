import type { HookRegistration, HookResult } from "./types.js";

export function createBuiltinHooks(): HookRegistration[] {
  const hooks: HookRegistration[] = [];

  hooks.push({
    id: "block-rm-rf",
    event: "PreToolUse",
    fn: async (context) => {
      const cmd = (context.toolInput?.command as string) || "";
      if (/rm\s+-rf\s+\//.test(cmd) || /rm\s+-rf\s+~/.test(cmd)) {
        return { action: "block", message: "Dangerous command blocked: rm -rf on root/home" };
      }
      return { action: "allow" };
    },
    source: "builtin",
  });

  hooks.push({
    id: "audit-mcp",
    event: "PreToolUse",
    fn: async (context) => {
      if (context.toolName?.startsWith("mcp__")) {
        console.log(`[AUDIT] MCP tool called: ${context.toolName} at ${new Date().toISOString()}`);
      }
      return { action: "allow" };
    },
    source: "builtin",
  });

  hooks.push({
    id: "log-tool-use",
    event: "PostToolUse",
    fn: async () => {
      return { action: "allow" };
    },
    source: "builtin",
  });

  return hooks;
}

export function createBlockRmRfHook(): HookRegistration {
  return {
    id: "block-rm-rf",
    event: "PreToolUse",
    fn: async (context) => {
      const cmd = (context.toolInput?.command as string) || "";
      if (/rm\s+-rf\s+\//.test(cmd) || /rm\s+-rf\s+~/.test(cmd)) {
        return { action: "block", message: "Dangerous command blocked" };
      }
      return { action: "allow" };
    },
    source: "builtin",
  };
}

export function createAuditMcpHook(): HookRegistration {
  return {
    id: "audit-mcp",
    event: "PreToolUse",
    fn: async (context) => {
      if (context.toolName?.startsWith("mcp__")) {
        console.log(`[AUDIT] MCP tool called: ${context.toolName}`);
      }
      return { action: "allow" };
    },
    source: "builtin",
  };
}

export function createLogToolUseHook(): HookRegistration {
  return {
    id: "log-tool-use",
    event: "PostToolUse",
    fn: async () => {
      return { action: "allow" };
    },
    source: "builtin",
  };
}
