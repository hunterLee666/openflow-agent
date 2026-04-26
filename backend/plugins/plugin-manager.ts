import { EventEmitter } from "node:events";
import { watch, FSWatcher } from "node:fs";
import { resolve, dirname } from "node:path";
import type {
  PluginManifest,
  PluginComponent,
  PluginInfo,
  PluginConfig,
  CommandComponent,
  AgentComponent,
  SkillComponent,
  HookComponent,
  McpComponent,
} from "./plugin-types.js";
import { PluginLoader } from "./plugin-loader.js";
import { z } from "zod";

export enum PluginStatus {
  LOADED = "loaded",
  ACTIVATED = "activated",
  DISABLED = "disabled",
  ERROR = "error",
}

export const PluginStatusSchema = z.nativeEnum(PluginStatus);

export type PluginComponentType = "command" | "agent" | "skill" | "hook" | "mcp";
export const PluginComponentTypeSchema = z.enum(["command", "agent", "skill", "hook", "mcp"]);

export type PluginEventType = "registered" | "unregistered" | "enabled" | "disabled" | "reloaded" | "activated" | "deactivated" | "error";
export const PluginEventTypeSchema = z.enum([
  "registered",
  "unregistered",
  "enabled",
  "disabled",
  "reloaded",
  "activated",
  "deactivated",
  "error",
]);

export interface PluginEvent {
  type: PluginEventType;
  pluginName: string;
  timestamp: number;
}

export const PluginEventSchema = z.object({
  type: PluginEventTypeSchema,
  pluginName: z.string(),
  timestamp: z.number(),
});

export interface PluginRegistryEntry {
  manifest: PluginManifest;
  info: PluginInfo;
  status: PluginStatus;
  instance: unknown;
  activatedAt?: number;
  source: string;
}

export interface PluginModule {
  onBeforeActivate?: () => Promise<void>;
  onAfterActivate?: () => Promise<void>;
  onBeforeDeactivate?: () => Promise<void>;
  onAfterDeactivate?: () => Promise<void>;
  deactivate?: () => Promise<void>;
  healthCheck?: () => Promise<boolean>;
}

export interface PluginContext {
  telemetry: {
    log: (event: string, data?: Record<string, unknown>) => void;
  };
}

export class PluginManager extends EventEmitter {
  private plugins = new Map<string, PluginRegistryEntry>();
  private loader = new PluginLoader();
  private watchers = new Map<string, FSWatcher>();
  private context: PluginContext;

  constructor(context: PluginContext) {
    super();
    this.context = context;
  }

  async discover(basePath: string): Promise<PluginInfo[]> {
    const dirs = await this.loader.findPluginDirs(basePath);
    const allPlugins: PluginInfo[] = [];

    for (const dir of dirs) {
      const plugins = await this.loader.loadPluginsFromDir(dir);
      allPlugins.push(...plugins);
    }

    return allPlugins;
  }

  async register(pluginInfo: PluginInfo, source = "manual"): Promise<void> {
    const name = pluginInfo.name;

    if (this.plugins.has(name)) {
      this.context.telemetry.log("plugin:register_duplicate", { name });
      return;
    }

    this.plugins.set(name, {
      manifest: {
        name: pluginInfo.name,
        version: pluginInfo.version,
        description: pluginInfo.description,
        components: pluginInfo.components,
      },
      info: pluginInfo,
      status: PluginStatus.LOADED,
      instance: undefined,
      source,
    });

    this.emit("pluginEvent", {
      type: "registered",
      pluginName: name,
      timestamp: Date.now(),
    } as PluginEvent);

    this.context.telemetry.log("plugin:registered", { name });
  }

  async activate(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) {
      throw new Error(`Plugin not found: ${name}`);
    }

    if (entry.status === PluginStatus.ACTIVATED) {
      return;
    }

    try {
      for (const component of entry.info.components) {
        if ("entry" in component && component.entry) {
          const module = (await this.loader.loadComponentModule(component.entry)) as PluginModule;
          if (module.onBeforeActivate) {
            await module.onBeforeActivate();
          }
        }
      }

      entry.status = PluginStatus.ACTIVATED;
      entry.activatedAt = Date.now();

      for (const component of entry.info.components) {
        if ("entry" in component && component.entry) {
          const module = (await this.loader.loadComponentModule(component.entry)) as PluginModule;
          if (module.onAfterActivate) {
            await module.onAfterActivate();
          }
        }
      }

      this.emit("pluginEvent", {
        type: "activated",
        pluginName: name,
        timestamp: Date.now(),
      } as PluginEvent);

      this.context.telemetry.log("plugin:activated", { name });
    } catch (error) {
      entry.status = PluginStatus.ERROR;
      this.emit("pluginEvent", {
        type: "error",
        pluginName: name,
        timestamp: Date.now(),
      } as PluginEvent);
      throw error;
    }
  }

  async deactivate(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) {
      throw new Error(`Plugin not found: ${name}`);
    }

    if (entry.status !== PluginStatus.ACTIVATED) {
      return;
    }

    try {
      for (const component of entry.info.components) {
        if ("entry" in component && component.entry) {
          const module = (await this.loader.loadComponentModule(component.entry)) as PluginModule;
          if (module.onBeforeDeactivate) {
            await module.onBeforeDeactivate();
          }
        }
      }

      for (const component of entry.info.components) {
        if ("entry" in component && component.entry) {
          const module = (await this.loader.loadComponentModule(component.entry)) as PluginModule;
          if (module.deactivate) {
            await module.deactivate();
          }
        }
      }

      entry.status = PluginStatus.DISABLED;
      entry.instance = undefined;

      for (const component of entry.info.components) {
        if ("entry" in component && component.entry) {
          const module = (await this.loader.loadComponentModule(component.entry)) as PluginModule;
          if (module.onAfterDeactivate) {
            await module.onAfterDeactivate();
          }
        }
      }

      this.emit("pluginEvent", {
        type: "deactivated",
        pluginName: name,
        timestamp: Date.now(),
      } as PluginEvent);

      this.context.telemetry.log("plugin:deactivated", { name });
    } catch (error) {
      this.emit("pluginEvent", {
        type: "error",
        pluginName: name,
        timestamp: Date.now(),
      } as PluginEvent);
      throw error;
    }
  }

  async enable(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) {
      throw new Error(`Plugin not found: ${name}`);
    }

    entry.info.enabled = true;

    this.emit("pluginEvent", {
      type: "enabled",
      pluginName: name,
      timestamp: Date.now(),
    } as PluginEvent);

    this.context.telemetry.log("plugin:enabled", { name });
  }

  async disable(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) {
      throw new Error(`Plugin not found: ${name}`);
    }

    entry.info.enabled = false;

    if (entry.status === PluginStatus.ACTIVATED) {
      await this.deactivate(name);
    }

    this.emit("pluginEvent", {
      type: "disabled",
      pluginName: name,
      timestamp: Date.now(),
    } as PluginEvent);

    this.context.telemetry.log("plugin:disabled", { name });
  }

  async reload(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) {
      throw new Error(`Plugin not found: ${name}`);
    }

    const wasActivated = entry.status === PluginStatus.ACTIVATED;

    if (wasActivated) {
      await this.deactivate(name);
    }

    const freshInfo = await this.loader.loadPlugin(entry.info.path);
    if (freshInfo) {
      entry.manifest = {
        name: freshInfo.name,
        version: freshInfo.version,
        description: freshInfo.description,
        components: freshInfo.components,
      };
      entry.info = freshInfo;
    }

    if (wasActivated) {
      await this.activate(name);
    }

    this.emit("pluginEvent", {
      type: "reloaded",
      pluginName: name,
      timestamp: Date.now(),
    } as PluginEvent);

    this.context.telemetry.log("plugin:reloaded", { name });
  }

  async unregister(name: string): Promise<void> {
    const entry = this.plugins.get(name);
    if (!entry) {
      return;
    }

    if (entry.status === PluginStatus.ACTIVATED) {
      await this.deactivate(name);
    }

    this.plugins.delete(name);

    this.emit("pluginEvent", {
      type: "unregistered",
      pluginName: name,
      timestamp: Date.now(),
    } as PluginEvent);

    this.context.telemetry.log("plugin:unregistered", { name });
  }

  getDisabledModelInvocations(name: string): string[] {
    const entry = this.plugins.get(name);
    return entry?.manifest.disableModelInvocationFor || [];
  }

  getAllDisabledModelInvocations(): Set<string> {
    const disabled = new Set<string>();
    for (const entry of this.plugins.values()) {
      if (entry.status === PluginStatus.ACTIVATED && entry.info.enabled) {
        for (const item of entry.manifest.disableModelInvocationFor || []) {
          disabled.add(item);
        }
      }
    }
    return disabled;
  }

  get(name: string): PluginInfo | null {
    const entry = this.plugins.get(name);
    return entry?.info || null;
  }

  getEntry(name: string): PluginRegistryEntry | null {
    return this.plugins.get(name) || null;
  }

  getAll(): PluginInfo[] {
    const result: PluginInfo[] = [];
    for (const [, entry] of this.plugins) {
      if (entry.info.enabled) {
        result.push(entry.info);
      }
    }
    return result;
  }

  getAllEntries(): PluginRegistryEntry[] {
    return Array.from(this.plugins.values());
  }

  isEnabled(name: string): boolean {
    const entry = this.plugins.get(name);
    return entry?.info.enabled ?? false;
  }

  has(name: string): boolean {
    return this.plugins.has(name);
  }

  size(): number {
    return this.plugins.size;
  }

  findByTrigger(input: string): PluginComponent | undefined {
    const lower = input.toLowerCase();
    for (const entry of this.plugins.values()) {
      if (entry.status !== PluginStatus.ACTIVATED) continue;

      for (const component of entry.info.components) {
        if (component.type === "skill") {
          const triggers = component.config.trigger || [];
          if (triggers.some((t: string) => lower.includes(t.toLowerCase()))) {
            return component;
          }
        }
      }
    }
    return undefined;
  }

  list(filter?: PluginComponentType): PluginInfo[] {
    const result: PluginInfo[] = [];
    for (const [, entry] of this.plugins) {
      if (filter) {
        const hasType = entry.info.components.some((c) => c.type === filter);
        if (!hasType) continue;
      }
      result.push(entry.info);
    }
    return result;
  }

  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const [name, entry] of this.plugins) {
      if (entry.status !== PluginStatus.ACTIVATED) {
        results.set(name, false);
        continue;
      }

      let healthy = true;
      for (const component of entry.info.components) {
        if ("entry" in component && component.entry) {
          try {
            const module = (await this.loader.loadComponentModule(component.entry)) as PluginModule;
            if (module.healthCheck) {
              const isHealthy = await module.healthCheck();
              if (!isHealthy) {
                healthy = false;
              }
            }
          } catch {
            healthy = false;
          }
        }
      }

      results.set(name, healthy);
    }
    return results;
  }

  async watchDirectory(path: string): Promise<void> {
    if (this.watchers.has(path)) return;

    const absolutePath = resolve(path);
    const watcher = watch(absolutePath, { recursive: true }, (_eventType, filename) => {
      if (filename && (filename.endsWith(".ts") || filename.endsWith(".json") || filename.endsWith(".md"))) {
        this.handleFileChange(absolutePath, filename);
      }
    });

    this.watchers.set(path, watcher);
    this.context.telemetry.log("plugin:watch_started", { path });
  }

  stopWatching(path: string): void {
    const watcher = this.watchers.get(path);
    if (watcher) {
      watcher.close();
      this.watchers.delete(path);
      this.context.telemetry.log("plugin:watch_stopped", { path });
    }
  }

  stopAllWatching(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  private async handleFileChange(_dirPath: string, filename: string): Promise<void> {
    const pluginName = dirname(filename).split("/").pop();
    if (!pluginName) return;

    const entry = this.plugins.get(pluginName);
    if (entry && entry.status === PluginStatus.ACTIVATED) {
      this.context.telemetry.log("plugin:file_change_detected", { plugin: pluginName, filename });
      await this.reload(pluginName);
    }
  }

  async loadFromDirectory(basePath: string): Promise<void> {
    const plugins = await this.discover(basePath);

    for (const plugin of plugins) {
      await this.register(plugin, "discovered");
      if (plugin.enabled) {
        await this.activate(plugin.name);
      }
    }
  }

  async shutdown(): Promise<void> {
    this.stopAllWatching();

    for (const name of Array.from(this.plugins.keys())) {
      try {
        await this.deactivate(name);
      } catch {
        // Continue shutting down other plugins
      }
    }

    this.plugins.clear();
  }

  getActiveCount(): number {
    let count = 0;
    for (const entry of this.plugins.values()) {
      if (entry.status === PluginStatus.ACTIVATED) count++;
    }
    return count;
  }

  getCountByType(type: PluginComponentType): number {
    let count = 0;
    for (const entry of this.plugins.values()) {
      const hasType = entry.info.components.some((c) => c.type === type);
      if (hasType) count++;
    }
    return count;
  }

  clear(): void {
    this.plugins.clear();
  }
}

export function createPluginManager(context: PluginContext): PluginManager {
  return new PluginManager(context);
}
