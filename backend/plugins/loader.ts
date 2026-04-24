import { readFile, readdir, stat } from "fs/promises";
import { join, resolve } from "path";
import type {
  LoadedPlugin,
  PluginLoadResult,
  PluginError,
  PluginManifest,
} from "./types.js";
import type { HooksSettings } from "../hooks/types.js";
import { parsePluginManifest } from "./manifest.js";

const PLUGIN_MANIFEST_FILE = "plugin.json";
const HOOKS_DIR = "hooks";
const HOOKS_FILE = "hooks.json";
const COMMANDS_DIR = "commands";
const AGENTS_DIR = "agents";
const SKILLS_DIR = "skills";
const OUTPUT_STYLES_DIR = "output-styles";

let loadedPluginsCache: PluginLoadResult | null = null;

export function clearPluginCache(reason?: string): void {
  if (reason) {
    console.debug(`Clearing plugin cache: ${reason}`);
  }
  loadedPluginsCache = null;
}

export function getPluginsDirectory(): string {
  return process.env.PLUGIN_DIR || join(process.cwd(), ".plugins");
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function readDirectory(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

export function parsePluginIdentifier(
  pluginId: string
): { name: string; marketplace: string | null } {
  const atIndex = pluginId.lastIndexOf("@");
  if (atIndex > 0) {
    return {
      name: pluginId.substring(0, atIndex),
      marketplace: pluginId.substring(atIndex + 1),
    };
  }
  return { name: pluginId, marketplace: null };
}

export async function loadPluginFromPath(
  pluginPath: string,
  source: string
): Promise<{ plugin: LoadedPlugin | null; errors: PluginError[] }> {
  const errors: PluginError[] = [];

  const manifestPath = join(pluginPath, PLUGIN_MANIFEST_FILE);
  let manifest: PluginManifest;

  const manifestExists = await pathExists(manifestPath);
  if (manifestExists) {
    const manifestContent = await readFile(manifestPath, "utf-8");
    const parsed = parsePluginManifest(manifestContent);
    if (!parsed) {
      errors.push({
        type: "manifest-parse-error",
        source,
        manifestPath,
        parseError: "Failed to parse plugin.json",
      });
      return { plugin: null, errors };
    }
    manifest = parsed;
  } else {
    const name = pluginPath.split(/[/\\]/).pop() || "unknown";
    manifest = {
      name,
      version: "1.0.0",
      description: `Plugin from ${pluginPath}`,
    };
  }

  const plugin: LoadedPlugin = {
    name: manifest.name,
    manifest,
    path: pluginPath,
    source,
    repository: source,
    enabled: true,
  };

  const hooksPath = join(pluginPath, HOOKS_DIR);
  if (await pathExists(hooksPath)) {
    const hooksJsonPath = join(hooksPath, HOOKS_FILE);
    if (await pathExists(hooksJsonPath)) {
      const hooksConfig = await readJsonFile<HooksSettings>(hooksJsonPath);
      if (hooksConfig) {
        plugin.hooksConfig = hooksConfig;
      }
    }
  }

  const commandsPath = join(pluginPath, COMMANDS_DIR);
  if (await pathExists(commandsPath)) {
    plugin.commandsPath = commandsPath;
  }

  const agentsPath = join(pluginPath, AGENTS_DIR);
  if (await pathExists(agentsPath)) {
    plugin.agentsPath = agentsPath;
  }

  const skillsPath = join(pluginPath, SKILLS_DIR);
  if (await pathExists(skillsPath)) {
    plugin.skillsPath = skillsPath;
  }

  const outputStylesPath = join(pluginPath, OUTPUT_STYLES_DIR);
  if (await pathExists(outputStylesPath)) {
    plugin.outputStylesPath = outputStylesPath;
  }

  return { plugin, errors };
}

export async function discoverPluginsInDirectory(
  dir: string,
  source: string
): Promise<{ plugins: LoadedPlugin[]; errors: PluginError[] }> {
  const plugins: LoadedPlugin[] = [];
  const errors: PluginError[] = [];

  const dirExists = await pathExists(dir);
  if (!dirExists) {
    return { plugins, errors };
  }

  const entries = await readDirectory(dir);

  for (const entry of entries) {
    const pluginPath = join(dir, entry);
    const pluginStat = await stat(pluginPath).catch(() => null);

    if (!pluginStat?.isDirectory()) {
      continue;
    }

    const result = await loadPluginFromPath(pluginPath, `${source}/${entry}`);
    if (result.plugin) {
      plugins.push(result.plugin);
    }
    errors.push(...result.errors);
  }

  return { plugins, errors };
}

export async function loadAllPlugins(): Promise<PluginLoadResult> {
  if (loadedPluginsCache) {
    return loadedPluginsCache;
  }

  const enabled: LoadedPlugin[] = [];
  const disabled: LoadedPlugin[] = [];
  const errors: PluginError[] = [];

  const pluginsDir = getPluginsDirectory();
  const result = await discoverPluginsInDirectory(pluginsDir, "local");

  for (const plugin of result.plugins) {
    if (plugin.enabled) {
      enabled.push(plugin);
    } else {
      disabled.push(plugin);
    }
  }
  errors.push(...result.errors);

  loadedPluginsCache = { enabled, disabled, errors };
  return loadedPluginsCache;
}

export async function loadAllPluginsCacheOnly(): Promise<PluginLoadResult> {
  return loadAllPlugins();
}

export function getPluginById(pluginId: string): LoadedPlugin | undefined {
  if (!loadedPluginsCache) {
    return undefined;
  }

  const { name } = parsePluginIdentifier(pluginId);
  return loadedPluginsCache.enabled.find((p) => p.name === name);
}

export async function getPluginCommands(
  plugin: LoadedPlugin
): Promise<string[]> {
  const commands: string[] = [];

  if (plugin.commandsPath) {
    const entries = await readDirectory(plugin.commandsPath);
    for (const entry of entries) {
      if (entry.endsWith(".md")) {
        commands.push(entry.replace(/\.md$/, ""));
      }
    }
  }

  return commands;
}

export async function getPluginAgents(
  plugin: LoadedPlugin
): Promise<string[]> {
  const agents: string[] = [];

  if (plugin.agentsPath) {
    const entries = await readDirectory(plugin.agentsPath);
    for (const entry of entries) {
      if (entry.endsWith(".md")) {
        agents.push(entry.replace(/\.md$/, ""));
      }
    }
  }

  return agents;
}

export async function getPluginSkills(
  plugin: LoadedPlugin
): Promise<string[]> {
  const skills: string[] = [];

  if (plugin.skillsPath) {
    const entries = await readDirectory(plugin.skillsPath);
    for (const entry of entries) {
      const skillPath = join(plugin.skillsPath!, entry);
      const skillStat = await stat(skillPath).catch(() => null);
      if (skillStat?.isDirectory()) {
        skills.push(entry);
      }
    }
  }

  return skills;
}

export function validatePluginPath(basePath: string, relativePath: string): string {
  const resolved = resolve(basePath, relativePath);
  if (!resolved.startsWith(basePath)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return resolved;
}
