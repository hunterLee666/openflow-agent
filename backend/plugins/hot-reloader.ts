import { FSWatcher, watch, existsSync, statSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { EventEmitter } from "events";
import { readFile } from "fs/promises";
import { z } from "zod";

export const PluginChangeEventSchema = z.object({
  type: z.enum(["added", "removed", "changed", "error"]),
  pluginName: z.string(),
  pluginPath: z.string(),
  timestamp: z.number(),
  error: z.instanceof(Error).optional(),
});

export type PluginChangeEvent = z.infer<typeof PluginChangeEventSchema>;

export const HotReloadConfigSchema = z.object({
  debounceMs: z.number(),
  maxRetries: z.number(),
  retryDelayMs: z.number(),
  watchInterval: z.number().optional(),
});

export type HotReloadConfig = z.infer<typeof HotReloadConfigSchema>;

const DEFAULT_CONFIG: HotReloadConfig = {
  debounceMs: 300,
  maxRetries: 3,
  retryDelayMs: 1000,
};

export class PluginHotReloader extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private pluginCache: Map<string, { path: string; manifest: Record<string, unknown>; loadedAt: number }> = new Map();
  private retryCount: Map<string, number> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private config: HotReloadConfig;
  private pluginDirs: string[] = [];
  private isWatching = false;

  constructor(config: Partial<HotReloadConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addWatchDir(dir: string): void {
    if (!this.pluginDirs.includes(dir)) {
      this.pluginDirs.push(dir);
    }
  }

  async startWatching(): Promise<void> {
    if (this.isWatching) return;
    this.isWatching = true;

    for (const dir of this.pluginDirs) {
      await this.watchDirectory(dir);
    }
  }

  stopWatching(): void {
    this.isWatching = false;

    for (const [path, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();

    for (const [path, timer] of this.debounceTimers) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  private async watchDirectory(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith(".json") || filename.endsWith(".md") || filename.endsWith(".ts") || filename.endsWith(".js"))) {
          this.handleFileChange(dir, filename);
        }
      });

      this.watchers.set(dir, watcher);
      await this.scanPlugins(dir);
    } catch (error) {
      this.emit("pluginEvent", {
        type: "error",
        pluginName: "unknown",
        pluginPath: dir,
        timestamp: Date.now(),
        error: error as Error,
      } as PluginChangeEvent);
    }
  }

  private handleFileChange(dir: string, filename: string): void {
    const key = `${dir}/${filename}`;

    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.reloadPlugin(dir, filename);
      this.debounceTimers.delete(key);
    }, this.config.debounceMs);

    this.debounceTimers.set(key, timer);
  }

  private async scanPlugins(dir: string): Promise<void> {
    try {
      const { readdir } = await import("fs/promises");
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = join(dir, entry.name);
          const manifestPath = join(pluginPath, "plugin.json");

          if (existsSync(manifestPath)) {
            await this.loadPluginManifest(pluginPath, manifestPath);
          }
        }
      }
    } catch (error) {
      this.emit("pluginEvent", {
        type: "error",
        pluginName: "unknown",
        pluginPath: dir,
        timestamp: Date.now(),
        error: error as Error,
      } as PluginChangeEvent);
    }
  }

  private async loadPluginManifest(pluginPath: string, manifestPath: string): Promise<void> {
    try {
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as Record<string, unknown>;

      this.pluginCache.set(pluginPath, {
        path: pluginPath,
        manifest,
        loadedAt: Date.now(),
      });

      const pluginName = (manifest.name as string) || "unknown";

      this.emit("pluginEvent", {
        type: "added",
        pluginName,
        pluginPath,
        timestamp: Date.now(),
      } as PluginChangeEvent);
    } catch (error) {
      this.handleError(pluginPath, error as Error);
    }
  }

  private async reloadPlugin(dir: string, filename: string): Promise<void> {
    const pluginPath = join(dir, filename.replace(/[/\\].*/, ""));
    const manifestPath = join(pluginPath, "plugin.json");

    if (existsSync(manifestPath)) {
      await this.loadPluginManifest(pluginPath, manifestPath);

      this.emit("pluginEvent", {
        type: "changed",
        pluginName: filename,
        pluginPath,
        timestamp: Date.now(),
      } as PluginChangeEvent);
    }
  }

  private handleError(pluginPath: string, error: Error): void {
    const retries = this.retryCount.get(pluginPath) || 0;

    if (retries < this.config.maxRetries) {
      this.retryCount.set(pluginPath, retries + 1);

      setTimeout(() => {
        const manifestPath = join(pluginPath, "plugin.json");
        if (existsSync(manifestPath)) {
          this.loadPluginManifest(pluginPath, manifestPath);
        }
      }, this.config.retryDelayMs);
    } else {
      this.emit("pluginEvent", {
        type: "error",
        pluginName: pluginPath,
        pluginPath,
        timestamp: Date.now(),
        error,
      } as PluginChangeEvent);

      this.retryCount.delete(pluginPath);
    }
  }

  getPluginManifest(pluginPath: string): Record<string, unknown> | null {
    const cached = this.pluginCache.get(pluginPath);
    return cached?.manifest || null;
  }

  getAllCachedPlugins(): Array<{ path: string; manifest: Record<string, unknown>; loadedAt: number }> {
    const result: Array<{ path: string; manifest: Record<string, unknown>; loadedAt: number }> = [];
    for (const [path, data] of this.pluginCache) {
      result.push({ path, manifest: data.manifest, loadedAt: data.loadedAt });
    }
    return result;
  }

  clearCache(pluginPath?: string): void {
    if (pluginPath) {
      this.pluginCache.delete(pluginPath);
    } else {
      this.pluginCache.clear();
    }
  }

  validatePluginPath(basePath: string, relativePath: string): string {
    const resolved = resolve(basePath, relativePath);
    if (!resolved.startsWith(basePath)) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }
    return resolved;
  }
}
