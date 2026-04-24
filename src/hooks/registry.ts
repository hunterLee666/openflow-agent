import type {
  HookRegistry,
  RegisteredHook,
  HookEvent,
  HookPayload,
  HookDecision,
  HookMatcher,
} from "./types.js";
import { matchTool, mergeDecisions } from "./types.js";

export class DefaultHookRegistry implements HookRegistry {
  private hooks = new Map<string, RegisteredHook>();

  register(hook: RegisteredHook): void {
    this.hooks.set(hook.id, hook);
  }

  unregister(id: string): void {
    this.hooks.delete(id);
  }

  async dispatch(
    event: HookEvent,
    payload: Omit<HookPayload, "event" | "timestamp">,
  ): Promise<HookDecision> {
    const candidates = this.list(event)
      .filter((h) => {
        if (!h.matcher) return true;
        if (payload.tool && h.matcher.type !== "risk" && h.matcher.type !== "all") {
          return matchTool(h.matcher, payload.tool);
        }
        if (h.matcher.type === "risk" && payload.risk) {
          const levels = ["low", "medium", "high", "critical"] as const;
          return levels.indexOf(payload.risk.level) >= levels.indexOf(h.matcher.minLevel);
        }
        return h.matcher.type === "all";
      })
      .sort((a, b) => a.priority - b.priority);

    let decision: HookDecision = { type: "allow" };

    for (const hook of candidates) {
      const fullPayload: HookPayload = {
        ...payload,
        event,
        timestamp: Date.now(),
      };
      try {
        const result = await hook.callback(fullPayload);
        decision = mergeDecisions(decision, result);
        if (decision.type === "block") break;
      } catch (e) {
        // Log but don't break the chain for observer hooks
        console.error(`Hook ${hook.id} failed:`, e);
      }
    }

    return decision;
  }

  list(event?: HookEvent): RegisteredHook[] {
    const all = Array.from(this.hooks.values());
    if (!event) return all;
    return all.filter((h) => h.event === event);
  }
}
