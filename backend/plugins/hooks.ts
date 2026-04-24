import type { LoadedPlugin, PluginHookMatcher } from "./types.js";
import type { HookEvent, HooksSettings, HookMatcher } from "../hooks/types.js";
import { loadAllPluginsCacheOnly, clearPluginCache } from "./loader.js";

const registeredPluginHooks: Partial<Record<HookEvent, PluginHookMatcher[]>> = {};

export function clearRegisteredPluginHooks(): void {
  for (const key of Object.keys(registeredPluginHooks)) {
    delete registeredPluginHooks[key as HookEvent];
  }
}

export function getRegisteredHooks(): Partial<Record<HookEvent, PluginHookMatcher[]>> {
  return registeredPluginHooks;
}

export function registerHookCallbacks(
  hooks: Partial<Record<HookEvent, PluginHookMatcher[]>>
): void {
  for (const [event, matchers] of Object.entries(hooks)) {
    if (matchers && matchers.length > 0) {
      registeredPluginHooks[event as HookEvent] = matchers;
    }
  }
}

function convertPluginHooksToMatchers(
  plugin: LoadedPlugin
): Record<HookEvent, PluginHookMatcher[]> {
  const pluginMatchers: Record<HookEvent, PluginHookMatcher[]> = {} as Record<
    HookEvent,
    PluginHookMatcher[]
  >;

  if (!plugin.hooksConfig) {
    return pluginMatchers;
  }

  for (const [event, matchers] of Object.entries(plugin.hooksConfig)) {
    const hookEvent = event as HookEvent;
    if (!matchers || (matchers as HookMatcher[]).length === 0) {
      continue;
    }

    pluginMatchers[hookEvent] = (matchers as HookMatcher[]).map((m) => ({
      matcher: m.matcher,
      hooks: m.hooks,
      pluginRoot: plugin.path,
      pluginName: plugin.name,
      pluginId: plugin.source,
    }));
  }

  return pluginMatchers;
}

let hooksLoaded = false;

export async function loadPluginHooks(): Promise<void> {
  if (hooksLoaded) {
    return;
  }

  const { enabled } = await loadAllPluginsCacheOnly();
  const allPluginHooks: Partial<Record<HookEvent, PluginHookMatcher[]>> = {};

  for (const plugin of enabled) {
    if (!plugin.hooksConfig) {
      continue;
    }

    console.debug(`Loading hooks from plugin: ${plugin.name}`);
    const pluginMatchers = convertPluginHooksToMatchers(plugin);

    for (const event of Object.keys(pluginMatchers) as HookEvent[]) {
      if (!allPluginHooks[event]) {
        allPluginHooks[event] = [];
      }
      allPluginHooks[event]!.push(...pluginMatchers[event]);
    }
  }

  clearRegisteredPluginHooks();
  registerHookCallbacks(allPluginHooks);

  const totalHooks = Object.values(allPluginHooks).reduce(
    (sum, matchers) =>
      sum + (matchers?.reduce((s, m) => s + m.hooks.length, 0) ?? 0),
    0
  );

  console.debug(
    `Registered ${totalHooks} hooks from ${enabled.length} plugins`
  );
  hooksLoaded = true;
}

export function clearPluginHookCache(): void {
  hooksLoaded = false;
}

export async function getHooksForEvent(
  event: HookEvent
): Promise<PluginHookMatcher[]> {
  if (!hooksLoaded) {
    await loadPluginHooks();
  }
  return registeredPluginHooks[event] ?? [];
}

export async function dispatchHook(
  event: HookEvent,
  context: Record<string, unknown>
): Promise<void> {
  const matchers = await getHooksForEvent(event);

  for (const matcher of matchers) {
    if (matcher.matcher) {
      const patterns = Array.isArray(matcher.matcher)
        ? matcher.matcher
        : [matcher.matcher];

      const matches = patterns.some((pattern) => {
        if (context.toolName && typeof pattern === "string") {
          const regex = new RegExp(pattern);
          return regex.test(context.toolName as string);
        }
        return false;
      });

      if (!matches) {
        continue;
      }
    }

    for (const hook of matcher.hooks) {
      if (hook.type === "command" && hook.command) {
        console.debug(
          `Executing hook command: ${hook.command} (from ${matcher.pluginName})`
        );
      }
    }
  }
}
