export type HookEvent =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PermissionRequest"
  | "StreamChunk";

export interface HookPayload {
  event: HookEvent;
  sessionId?: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  risk?: RiskAssessment;
  chunk?: string;
  prompt?: string;
  timestamp: number;
}

export interface RiskAssessment {
  level: "low" | "medium" | "high" | "critical";
  categories: string[];
  description: string;
}

export type HookDecision =
  | { type: "allow" }
  | { type: "block"; reason: string }
  | { type: "modify"; name?: string; args?: Record<string, unknown> };

export type HookCallback = (payload: HookPayload) => Promise<HookDecision>;

export interface RegisteredHook {
  id: string;
  event: HookEvent;
  matcher?: HookMatcher;
  callback: HookCallback;
  priority: number;
}

export type HookMatcher =
  | { type: "exact"; name: string }
  | { type: "prefix"; value: string }
  | { type: "regex"; pattern: RegExp }
  | { type: "risk"; minLevel: RiskAssessment["level"] }
  | { type: "all" };

export interface HookRegistry {
  register(hook: RegisteredHook): void;
  unregister(id: string): void;
  dispatch(event: HookEvent, payload: Omit<HookPayload, "event" | "timestamp">): Promise<HookDecision>;
  list(event?: HookEvent): RegisteredHook[];
}

export function matchTool(matcher: HookMatcher, name: string): boolean {
  switch (matcher.type) {
    case "exact":
      return name === matcher.name;
    case "prefix":
      return name.startsWith(matcher.value);
    case "regex":
      return matcher.pattern.test(name);
    case "all":
      return true;
    default:
      return false;
  }
}

export function mergeDecisions(acc: HookDecision, next: HookDecision): HookDecision {
  if (acc.type === "block" || next.type === "block") {
    return next.type === "block" ? next : acc;
  }
  if (next.type === "modify") {
    return {
      type: "modify",
      name: next.name ?? (acc.type === "modify" ? acc.name : undefined),
      args: {
        ...(acc.type === "modify" ? acc.args : {}),
        ...next.args,
      },
    };
  }
  return acc;
}
