import type { HookSystem, HookDefinition, HookContext, HookResult, HookEvent } from "../hooks/hook-system.js";
import type { HookComponent } from "./plugin-types.js";
import { PluginLoader } from "./plugin-loader.js";
import { z } from "zod";

export const HookComponentConfigSchema = z.object({
  event: z.string(),
  type: z.enum(["command", "prompt"]).optional(),
  matcher: z.string().optional(),
  priority: z.number().optional(),
});

export type HookComponentConfig = z.infer<typeof HookComponentConfigSchema>;

export class PluginHookRegistry {
  private hookSystem: HookSystem;
  private loader: PluginLoader;
  private registeredHooks: Map<string, HookDefinition> = new Map();

  constructor(hookSystem: HookSystem) {
    this.hookSystem = hookSystem;
    this.loader = new PluginLoader();
  }

  async registerHookComponent(component: HookComponent, pluginPath: string): Promise<void> {
    const module = await this.loader.loadComponentModule(component.entry);

    const config = HookComponentConfigSchema.parse(component.config);

    const hookDef: HookDefinition = {
      name: `plugin:${component.name}`,
      event: config.event as HookEvent,
      type: config.type || "command",
      matcher: config.matcher,
      priority: config.priority || 100,
      handler: async (ctx: HookContext): Promise<HookResult> => {
        const mod = module as Record<string, unknown>;

        if (typeof module === "function") {
          return (module as (ctx: HookContext) => Promise<HookResult>)(ctx);
        }

        if (mod && typeof mod.handler === "function") {
          return (mod.handler as (ctx: HookContext) => Promise<HookResult>)(ctx);
        }

        if (mod && typeof mod.default === "function") {
          return (mod.default as (ctx: HookContext) => Promise<HookResult>)(ctx);
        }

        return { action: "allow", reason: "Hook module has no handler" };
      },
    };

    this.hookSystem.register(hookDef);
    this.registeredHooks.set(component.name, hookDef);
  }

  unregisterHook(name: string): void {
    this.hookSystem.unregister(name);
    this.registeredHooks.delete(name);
  }

  getRegisteredHooks(): Map<string, HookDefinition> {
    return new Map(this.registeredHooks);
  }
}
