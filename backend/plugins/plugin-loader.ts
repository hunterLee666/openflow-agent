import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  PluginManifest,
  PluginComponent,
  PluginComponentType,
  CommandComponent,
  AgentComponent,
  SkillComponent,
  HookComponent,
  McpComponent,
  PluginInfo,
  PluginConfig,
} from "./plugin-types.js";

const PLUGIN_DIR_NAMES = [".openflow-plugins", ".openflow/plugins", "openflow-plugins"];
const MANIFEST_FILE = "plugin.json";
const DEFAULT_CONFIG_FILE = "plugin.config.json";

export class PluginLoader {
  async findPluginDirs(basePath: string): Promise<string[]> {
    const dirs: string[] = [];

    for (const dirName of PLUGIN_DIR_NAMES) {
      const fullPath = join(basePath, dirName);
      const exists = await this.pathExists(fullPath);
      if (exists) {
        dirs.push(fullPath);
      }
    }

    return dirs;
  }

  async loadPluginsFromDir(pluginDir: string): Promise<PluginInfo[]> {
    const plugins: PluginInfo[] = [];
    const entries = await readdir(pluginDir);

    for (const entry of entries) {
      const entryPath = join(pluginDir, entry);
      const entryStat = await stat(entryPath).catch(() => null);

      if (!entryStat?.isDirectory()) continue;

      const manifestPath = join(entryPath, MANIFEST_FILE);
      const manifestExists = await this.pathExists(manifestPath);

      if (!manifestExists) continue;

      try {
        const pluginInfo = await this.loadPlugin(entryPath);
        if (pluginInfo) {
          plugins.push(pluginInfo);
        }
      } catch (error) {
        console.error(`Failed to load plugin from ${entryPath}:`, error);
      }
    }

    return plugins;
  }

  async loadPlugin(pluginPath: string): Promise<PluginInfo | null> {
    const manifest = await this.loadManifest(pluginPath);
    if (!manifest) return null;

    const config = await this.loadConfig(pluginPath);
    const components = await this.loadComponents(pluginPath, manifest);

    return {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      path: pluginPath,
      enabled: config.enabled !== false,
      components,
      loadedAt: Date.now(),
    };
  }

  async loadManifest(pluginPath: string): Promise<PluginManifest | null> {
    const manifestPath = join(pluginPath, MANIFEST_FILE);
    const exists = await this.pathExists(manifestPath);
    if (!exists) return null;

    const content = await readFile(manifestPath, "utf-8");
    return JSON.parse(content) as PluginManifest;
  }

  async loadConfig(pluginPath: string): Promise<PluginConfig> {
    const configPath = join(pluginPath, DEFAULT_CONFIG_FILE);
    const exists = await this.pathExists(configPath);
    if (!exists) return { enabled: true };

    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content) as PluginConfig;
  }

  async loadComponents(pluginPath: string, manifest: PluginManifest): Promise<PluginComponent[]> {
    const components: PluginComponent[] = [];

    for (const component of manifest.components) {
      const resolved = await this.resolveComponent(pluginPath, component);
      if (resolved) {
        components.push(resolved);
      }
    }

    return components;
  }

  private async resolveComponent(pluginPath: string, component: PluginComponent): Promise<PluginComponent | null> {
    switch (component.type) {
      case "command":
        return this.resolveCommandComponent(pluginPath, component);
      case "agent":
        return this.resolveAgentComponent(pluginPath, component);
      case "skill":
        return this.resolveSkillComponent(pluginPath, component);
      case "hook":
        return this.resolveHookComponent(pluginPath, component);
      case "mcp":
        return this.resolveMcpComponent(pluginPath, component);
      default:
        console.warn(`Unknown component type: ${(component as PluginComponent).type}`);
        return null;
    }
  }

  private async resolveCommandComponent(pluginPath: string, component: PluginComponent): Promise<CommandComponent | null> {
    if (component.type !== "command") {
      return null;
    }

    const entryPath = component.entry ? join(pluginPath, component.entry) : null;

    if (entryPath) {
      const exists = await this.pathExists(entryPath);
      if (!exists) {
        console.warn(`Command entry not found: ${entryPath}`);
        return null;
      }
    }

    return {
      type: "command",
      name: component.name,
      description: component.description,
      entry: entryPath || "",
      config: {
        slashCommand: component.config.slashCommand || `/${component.name}`,
        permission: component.config.permission || "read-only",
        arguments: component.config.arguments || [],
      },
    };
  }

  private async resolveAgentComponent(pluginPath: string, component: PluginComponent): Promise<AgentComponent | null> {
    if (component.type !== "agent") {
      return null;
    }

    const entryPath = component.entry ? join(pluginPath, component.entry) : null;

    if (entryPath) {
      const exists = await this.pathExists(entryPath);
      if (!exists) {
        console.warn(`Agent entry not found: ${entryPath}`);
        return null;
      }
    }

    return {
      type: "agent",
      name: component.name,
      description: component.description,
      entry: entryPath || "",
      config: {
        model: component.config.model,
        tools: component.config.tools || [],
        systemPrompt: component.config.systemPrompt,
        maxTurns: component.config.maxTurns ?? 10,
      },
    };
  }

  private async resolveSkillComponent(pluginPath: string, component: PluginComponent): Promise<SkillComponent | null> {
    if (component.type !== "skill") {
      return null;
    }

    const entryPath = component.entry ? join(pluginPath, component.entry) : null;

    if (entryPath) {
      const exists = await this.pathExists(entryPath);
      if (!exists) {
        console.warn(`Skill entry not found: ${entryPath}`);
        return null;
      }
    }

    return {
      type: "skill",
      name: component.name,
      description: component.description,
      entry: entryPath || undefined,
      config: {
        trigger: component.config.trigger || [],
        metadata: component.config.metadata || {},
        agentskillsIo: component.config.agentskillsIo,
      },
    };
  }

  private async resolveHookComponent(pluginPath: string, component: PluginComponent): Promise<HookComponent | null> {
    if (component.type !== "hook") {
      return null;
    }

    const entryPath = component.entry ? join(pluginPath, component.entry) : null;

    if (!entryPath) {
      console.warn(`Hook entry is required for hook components: ${component.name}`);
      return null;
    }

    const exists = await this.pathExists(entryPath);
    if (!exists) {
      console.warn(`Hook entry not found: ${entryPath}`);
      return null;
    }

    return {
      type: "hook",
      name: component.name,
      description: component.description,
      entry: entryPath,
      config: {
        event: component.config.event,
        matcher: component.config.matcher,
        priority: component.config.priority ?? 100,
        type: component.config.type ?? "command",
      },
    };
  }

  private async resolveMcpComponent(_pluginPath: string, component: PluginComponent): Promise<McpComponent | null> {
    const mcpConfig = component.config as McpComponent["config"] | undefined;

    if (!mcpConfig?.command) {
      console.warn(`MCP command is required for MCP components: ${component.name}`);
      return null;
    }

    return {
      type: "mcp",
      name: component.name,
      description: component.description,
      config: {
        command: mcpConfig.command,
        args: mcpConfig.args || [],
        env: mcpConfig.env || {},
        timeout: mcpConfig.timeout || 30000,
        transport: mcpConfig.transport || "stdio",
      },
    };
  }

  async loadComponentModule(entryPath: string): Promise<unknown> {
    const exists = await this.pathExists(entryPath);
    if (!exists) {
      throw new Error(`Component entry not found: ${entryPath}`);
    }

    const fileUrl = pathToFileURL(entryPath).href;
    const mod = await import(fileUrl);
    return mod.default || mod;
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}

export async function discoverAndLoadPlugins(basePath: string): Promise<PluginInfo[]> {
  const loader = new PluginLoader();
  const pluginDirs = await loader.findPluginDirs(basePath);

  const allPlugins: PluginInfo[] = [];

  for (const dir of pluginDirs) {
    const plugins = await loader.loadPluginsFromDir(dir);
    allPlugins.push(...plugins);
  }

  return allPlugins;
}
