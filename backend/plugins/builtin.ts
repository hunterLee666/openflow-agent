import type {
  BuiltinPluginDefinition,
  LoadedPlugin,
  BuiltinSkillDefinition,
} from "./types.js";

const BUILTIN_PLUGINS = new Map<string, BuiltinPluginDefinition>();

export const BUILTIN_MARKETPLACE_NAME = "builtin";

export function registerBuiltinPlugin(definition: BuiltinPluginDefinition): void {
  BUILTIN_PLUGINS.set(definition.name, definition);
}

export function isBuiltinPluginId(pluginId: string): boolean {
  return pluginId.endsWith(`@${BUILTIN_MARKETPLACE_NAME}`);
}

export function getBuiltinPluginDefinition(
  name: string
): BuiltinPluginDefinition | undefined {
  return BUILTIN_PLUGINS.get(name);
}

export function getBuiltinPlugins(): {
  enabled: LoadedPlugin[];
  disabled: LoadedPlugin[];
} {
  const enabled: LoadedPlugin[] = [];
  const disabled: LoadedPlugin[] = [];

  for (const [name, definition] of BUILTIN_PLUGINS) {
    if (definition.isAvailable && !definition.isAvailable()) {
      continue;
    }

    const pluginId = `${name}@${BUILTIN_MARKETPLACE_NAME}`;
    const isEnabled = definition.defaultEnabled ?? true;

    const plugin: LoadedPlugin = {
      name,
      manifest: {
        name,
        description: definition.description,
        version: definition.version,
      },
      path: BUILTIN_MARKETPLACE_NAME,
      source: pluginId,
      repository: pluginId,
      enabled: isEnabled,
      isBuiltin: true,
      hooksConfig: definition.hooks,
      mcpServers: definition.mcpServers,
    };

    if (isEnabled) {
      enabled.push(plugin);
    } else {
      disabled.push(plugin);
    }
  }

  return { enabled, disabled };
}

export function getBuiltinPluginSkillCommands(): Array<{
  name: string;
  description: string;
  getPrompt: (args: { cwd: string; prompt: string }) => string | Promise<string>;
}> {
  const { enabled } = getBuiltinPlugins();
  const commands: Array<{
    name: string;
    description: string;
    getPrompt: (args: { cwd: string; prompt: string }) => string | Promise<string>;
  }> = [];

  for (const plugin of enabled) {
    const definition = BUILTIN_PLUGINS.get(plugin.name);
    if (!definition?.skills) continue;

    for (const skill of definition.skills) {
      commands.push({
        name: skill.name,
        description: skill.description,
        getPrompt: skill.getPromptForCommand ?? (({ prompt }) => prompt),
      });
    }
  }

  return commands;
}

export function clearBuiltinPlugins(): void {
  BUILTIN_PLUGINS.clear();
}

export function initBuiltinPlugins(): void {
  // Register default builtin plugins here
  // Example:
  // registerBuiltinPlugin({
  //   name: 'example-plugin',
  //   description: 'An example builtin plugin',
  //   version: '1.0.0',
  //   defaultEnabled: true,
  // });
}
