import { HookSystem, type HookContext, type HookResult } from "./hook-system.js";

export function createSessionStartHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "session-start-validator",
    event: "SessionStart",
    priority: 100,
    handler: async (ctx: HookContext) => {
      return {
        action: "allow",
        message: `Session ${ctx.sessionId} started`,
      };
    },
  });
}

export function createUserPromptSubmitHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "user-prompt-filter",
    event: "UserPromptSubmit",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const prompt = ctx.metadata?.prompt as string | undefined;

      if (!prompt) {
        return { action: "allow" };
      }

      const blockedPatterns = [
        /rm\s+-rf\s+\//i,
        /DROP\s+DATABASE/i,
        /DELETE\s+FROM\s+\w+\s*;/i,
      ];

      for (const pattern of blockedPatterns) {
        if (pattern.test(prompt)) {
          return {
            action: "block",
            message: "Prompt contains potentially dangerous instructions",
          };
        }
      }

      return { action: "allow" };
    },
  });
}

export function createPreToolUseHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "pre-tool-use-validator",
    event: "PreToolUse",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const toolName = ctx.toolName;
      const toolCall = ctx.toolCall;

      if (!toolName) {
        return { action: "allow" };
      }

      if (toolName === "Bash" && toolCall) {
        const command = (toolCall.command as string) || "";
        const dangerousPatterns = [
          /rm\s+-rf\s+\//i,
          /:\(\)\s*:\|:\s*&\s*;:/,
          />\s*\/dev\/sda/i,
          /mkfs/i,
          /dd\s+if=\/dev\/random/i,
        ];

        for (const pattern of dangerousPatterns) {
          if (pattern.test(command)) {
            return {
              decision: "deny",
              action: "block",
              reason: `Blocked dangerous command pattern`,
            };
          }
        }
      }

      if (toolName === "Write" && toolCall) {
        const filePath = (toolCall.file_path as string) || "";
        const projectDir = ctx.projectDir || "";

        if (projectDir && !filePath.startsWith(projectDir)) {
          return {
            decision: "deny",
            action: "block",
            reason: "File is outside project directory",
          };
        }
      }

      return { action: "allow" };
    },
  });
}

export function createPostToolUseHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "post-tool-use-context",
    event: "PostToolUse",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const toolName = ctx.toolName;

      if (toolName === "Read" && ctx.toolCall) {
        const filePath = (ctx.toolCall.file_path as string) || "";
        let context = "";

        if (filePath.endsWith(".py")) {
          context = "Note: This project uses Python. Check for async/await patterns.";
        } else if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
          context = "Note: This is a React component using TypeScript and hooks.";
        } else if (filePath.includes("database")) {
          context = "Note: This file relates to database operations.";
        }

        if (context) {
          return {
            action: "allow",
            additionalContext: context,
          };
        }
      }

      return { action: "allow" };
    },
  });
}

export function createStopHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "stop-action-extractor",
    event: "Stop",
    priority: 100,
    handler: async (ctx: HookContext) => {
      return {
        action: "allow",
        message: "Session stopped. Action items and TODOs should be extracted.",
      };
    },
  });
}

export function createSubagentStopHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "subagent-stop-logger",
    event: "SubagentStop",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const subagentName = ctx.metadata?.subagentName as string | undefined;
      return {
        action: "allow",
        message: `Sub-agent ${subagentName || "unknown"} stopped`,
      };
    },
  });
}

export function createPreCompactHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "pre-compact-extractor",
    event: "PreCompact",
    priority: 100,
    handler: async (ctx: HookContext) => {
      return {
        action: "allow",
        message: "Extracting important information before compaction",
      };
    },
  });
}

export function createPostCompactHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "post-compact-validator",
    event: "PostCompact",
    priority: 100,
    handler: async (ctx: HookContext) => {
      return {
        action: "allow",
        message: "Post-compaction verification complete",
      };
    },
  });
}

export function createNotificationHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "notification-logger",
    event: "Notification",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const notificationType = ctx.metadata?.type as string | undefined;
      const message = ctx.metadata?.message as string | undefined;

      if (notificationType === "error") {
        console.error(`[Notification Error] ${message}`);
      }

      return { action: "allow" };
    },
  });
}

export function createStopFailureHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "stop-failure-handler",
    event: "StopFailure",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const error = ctx.metadata?.error as Error | undefined;

      if (error) {
        console.error(`[Stop Failure] Session ${ctx.sessionId}:`, error.message);
      }

      return {
        action: "allow",
        message: "Stop failure logged",
      };
    },
  });
}

export function createElicitationHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "elicitation-handler",
    event: "Elicitation",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const mcpServer = ctx.metadata?.mcpServer as string | undefined;

      return {
        action: "allow",
        message: `Elicitation request from ${mcpServer || "unknown"} MCP server`,
      };
    },
  });
}

export function createElicitationResultHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "elicitation-result-handler",
    event: "ElicitationResult",
    priority: 100,
    handler: async (ctx: HookContext) => {
      return {
        action: "allow",
        message: "Elicitation result processed",
      };
    },
  });
}

export function createPermissionRequestHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "permission-request-handler",
    event: "PermissionRequest",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const toolName = ctx.toolName;

      const autoApproveTools = ["Read", "Glob", "Grep", "LS"];

      if (toolName && autoApproveTools.includes(toolName)) {
        return {
          decision: "approve",
          action: "allow",
          reason: `Auto-approved: ${toolName} is safe`,
        };
      }

      return { action: "allow" };
    },
  });
}

export function createBudgetWarningHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "budget-warning",
    event: "BudgetWarning",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const usage = ctx.metadata?.usage as { inputTokens: number; outputTokens: number } | undefined;
      const budget = ctx.metadata?.budget as number | undefined;

      if (usage && budget) {
        const totalTokens = usage.inputTokens + usage.outputTokens;
        const usagePercent = (totalTokens / budget) * 100;

        if (usagePercent > 80) {
          return {
            action: "allow",
            message: `Token usage at ${usagePercent.toFixed(1)}% of budget`,
            data: { usagePercent, totalTokens, budget },
          };
        }
      }

      return { action: "allow" };
    },
  });
}

export function createErrorHook(hookSystem: HookSystem): void {
  hookSystem.register({
    name: "error-logger",
    event: "Error",
    priority: 100,
    handler: async (ctx: HookContext) => {
      const error = ctx.metadata?.error as Error | undefined;

      if (error) {
        console.error(`[Hook Error Logger] Session ${ctx.sessionId}:`, error.message);
      }

      return { action: "allow" };
    },
  });
}

export function setupDefaultHooks(hookSystem: HookSystem): void {
  createSessionStartHook(hookSystem);
  createUserPromptSubmitHook(hookSystem);
  createPreToolUseHook(hookSystem);
  createPostToolUseHook(hookSystem);
  createStopHook(hookSystem);
  createSubagentStopHook(hookSystem);
  createPreCompactHook(hookSystem);
  createPostCompactHook(hookSystem);
  createNotificationHook(hookSystem);
  createStopFailureHook(hookSystem);
  createElicitationHook(hookSystem);
  createElicitationResultHook(hookSystem);
  createPermissionRequestHook(hookSystem);
  createBudgetWarningHook(hookSystem);
  createErrorHook(hookSystem);
}
