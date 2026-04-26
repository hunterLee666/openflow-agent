import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

export type HookEvent =
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "AssistantResponseComplete"
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SubagentStop"
  | "PreCompact"
  | "PostCompact"
  | "Notification"
  | "StopFailure"
  | "Elicitation"
  | "ElicitationResult"
  | "PermissionRequest"
  | "Error"
  | "BudgetWarning";

export type HookType = "command" | "prompt";

export interface HookContext {
  sessionId: string;
  timestamp: number;
  event?: HookEvent;
  toolName?: string;
  toolCall?: Record<string, unknown>;
  toolOutput?: unknown;
  metadata?: Record<string, unknown>;
  projectDir?: string;
  conversationId?: string;
}

export interface HookResult {
  decision?: "approve" | "deny";
  action?: "allow" | "block" | "modify";
  reason?: string;
  message?: string;
  updatedInput?: Record<string, unknown>;
  additionalContext?: string;
  data?: Record<string, unknown>;
  hookSpecificOutput?: Record<string, unknown>;
}

export interface CommandHookConfig {
  matcher: string;
  event: HookEvent;
  type: "command";
  command: string;
  timeout?: number;
}

export interface PromptHookConfig {
  matcher: string;
  event: HookEvent;
  type: "prompt";
  prompt: string;
}

export interface HookDefinition {
  name: string;
  event: HookEvent;
  type?: HookType;
  handler: (ctx: HookContext) => Promise<HookResult>;
  priority?: number;
  matcher?: string;
}

export interface AsyncHookConfig {
  event: HookEvent;
  command: string;
  timeout?: number;
}

export interface HttpHookConfig {
  event: HookEvent;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export class HookSystem extends EventEmitter {
  private hooks: Map<HookEvent, HookDefinition[]> = new Map();
  private asyncHooks: Map<HookEvent, AsyncHookConfig[]> = new Map();
  private httpHooks: Map<HookEvent, HttpHookConfig[]> = new Map();

  register(hook: HookDefinition): void {
    const eventHooks = this.hooks.get(hook.event) || [];
    eventHooks.push(hook);
    eventHooks.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    this.hooks.set(hook.event, eventHooks);
    this.emit("hook:registered", { name: hook.name, event: hook.event });
  }

  registerCommandHook(config: CommandHookConfig): void {
    const hook: HookDefinition = {
      name: `cmd:${config.event}:${config.matcher}`,
      event: config.event,
      type: "command",
      matcher: config.matcher,
      handler: async (ctx: HookContext) => {
        return executeCommandHook(config.command, ctx, config.timeout || 30000);
      },
      priority: 100,
    };

    this.register(hook);
  }

  registerPromptHook(config: PromptHookConfig): void {
    const hook: HookDefinition = {
      name: `prompt:${config.event}:${config.matcher}`,
      event: config.event,
      type: "prompt",
      matcher: config.matcher,
      handler: async (ctx: HookContext) => {
        return executePromptHook(config.prompt, ctx);
      },
      priority: 200,
    };

    this.register(hook);
  }

  registerAsyncHook(config: AsyncHookConfig): void {
    const asyncHooks = this.asyncHooks.get(config.event) || [];
    asyncHooks.push(config);
    this.asyncHooks.set(config.event, asyncHooks);
  }

  registerHttpHook(config: HttpHookConfig): void {
    const httpHooks = this.httpHooks.get(config.event) || [];
    httpHooks.push(config);
    this.httpHooks.set(config.event, httpHooks);
  }

  async dispatch(event: HookEvent, ctx: HookContext): Promise<HookResult[]> {
    const results: HookResult[] = [];

    const eventHooks = this.hooks.get(event) || [];
    const filteredHooks = eventHooks.filter((hook) => {
      if (!hook.matcher) return true;
      return this.matchesHook(hook.matcher, ctx);
    });

    for (const hook of filteredHooks) {
      try {
        const result = await hook.handler({ ...ctx, event });
        results.push(result);

        if (result.action === "block" || result.decision === "deny") {
          this.emit("hook:blocked", { name: hook.name, event, result });
          return results;
        }
      } catch (error) {
        console.error(`Hook "${hook.name}" failed:`, error);
        this.emit("hook:error", { name: hook.name, event, error });
      }
    }

    const asyncHooks = this.asyncHooks.get(event) || [];
    for (const asyncConfig of asyncHooks) {
      this.executeAsyncHook(asyncConfig, ctx);
    }

    const httpHooks = this.httpHooks.get(event) || [];
    for (const httpConfig of httpHooks) {
      this.executeHttpHook(httpConfig, ctx);
    }

    return results;
  }

  unregister(name: string): void {
    for (const [event, hooks] of this.hooks.entries()) {
      this.hooks.set(
        event,
        hooks.filter((h) => h.name !== name)
      );
    }
  }

  listHooks(): Array<{ event: HookEvent; name: string; type?: HookType; priority: number }> {
    const result: Array<{ event: HookEvent; name: string; type?: HookType; priority: number }> = [];
    for (const [event, hooks] of this.hooks.entries()) {
      for (const hook of hooks) {
        result.push({ event, name: hook.name, type: hook.type, priority: hook.priority ?? 0 });
      }
    }
    return result;
  }

  getHooksByEvent(event: HookEvent): HookDefinition[] {
    return this.hooks.get(event) || [];
  }

  private matchesHook(matcher: string, ctx: HookContext): boolean {
    if (!ctx.toolName && !ctx.metadata?.prompt) {
      return false;
    }

    try {
      const regex = new RegExp(matcher, "i");
      const target = ctx.toolName || (ctx.metadata?.prompt as string) || "";
      return regex.test(target);
    } catch {
      return ctx.toolName?.toLowerCase().includes(matcher.toLowerCase()) || false;
    }
  }

  private executeAsyncHook(config: AsyncHookConfig, ctx: HookContext): void {
    const child = spawn(config.command, [], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: config.timeout || 10000,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: ctx.projectDir || "",
        CLAUDE_SESSION_ID: ctx.sessionId,
        CLAUDE_EVENT: ctx.event || "",
      },
    });

    const input = JSON.stringify(ctx);
    child.stdin?.write(input);
    child.stdin?.end();

    child.on("error", (error) => {
      console.error(`Async hook failed for ${config.event}:`, error);
    });
  }

  private async executeHttpHook(config: HttpHookConfig, ctx: HookContext): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 10000);

      const response = await fetch(config.url, {
        method: config.method || "POST",
        headers: {
          "Content-Type": "application/json",
          ...config.headers,
        },
        body: JSON.stringify(ctx),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`HTTP hook failed for ${config.event}: ${response.status}`);
      }
    } catch (error) {
      console.error(`HTTP hook error for ${config.event}:`, error);
    }
  }
}

async function executeCommandHook(command: string, ctx: HookContext, timeout: number): Promise<HookResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: ctx.projectDir || "",
        CLAUDE_CODE_REMOTE: "false",
        CLAUDE_SESSION_ID: ctx.sessionId,
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdin?.write(JSON.stringify(ctx));
    child.stdin?.end();

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      try {
        const output = stdout.trim();
        if (output) {
          const result = JSON.parse(output) as HookResult;
          resolve(result);
        } else {
          resolve({
            decision: code === 0 ? "approve" : "deny",
            action: code === 0 ? "allow" : "block",
            reason: stderr || `Command exited with code ${code}`,
          });
        }
      } catch {
        resolve({
          decision: "approve",
          action: "allow",
          reason: "Command executed successfully",
        });
      }
    });

    child.on("error", () => {
      resolve({
        decision: "deny",
        action: "block",
        reason: `Command execution failed: ${command}`,
      });
    });
  });
}

async function executePromptHook(promptTemplate: string, ctx: HookContext): Promise<HookResult> {
  const prompt = promptTemplate
    .replace(/\{\{toolCall\}\}/g, JSON.stringify(ctx.toolCall || {}))
    .replace(/\{\{toolName\}\}/g, ctx.toolName || "")
    .replace(/\{\{sessionId\}\}/g, ctx.sessionId)
    .replace(/\{\{event\}\}/g, ctx.event || "")
    .replace(/\{\{conversation\}\}/g, JSON.stringify(ctx.metadata?.conversation || []));

  return {
    decision: "approve",
    action: "allow",
    reason: "Prompt hook evaluated",
    additionalContext: prompt,
  };
}

export function createHookSystem(): HookSystem {
  return new HookSystem();
}
