import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  CapabilityPlugin,
  CapabilitySource,
  DiscoveryResult,
  DiscoveryError,
  CapabilityManifest,
  CapabilityContext,
} from "../types/index.js";
import { CapabilityType } from "../types/index.js";

const PLUGIN_MANIFEST_FILE = "plugin.json";

export class PluginDiscovery {
  async discover(sources: CapabilitySource[]): Promise<DiscoveryResult> {
    const plugins: CapabilityPlugin[] = [];
    const errors: DiscoveryError[] = [];

    for (const source of sources) {
      try {
        switch (source.type) {
          case "filesystem":
            if (source.path) {
              const result = await this.discoverFromFS(source.path);
              plugins.push(...result.plugins);
              errors.push(...result.errors);
            }
            break;
          case "builtin":
            if (source.packages) {
              const result = await this.discoverBuiltin(source.packages);
              plugins.push(...result.plugins);
              errors.push(...result.errors);
            }
            break;
          case "npm":
            if (source.packages) {
              const result = await this.discoverFromNPM(source.packages);
              plugins.push(...result.plugins);
              errors.push(...result.errors);
            }
            break;
          case "remote":
            if (source.url) {
              const result = await this.discoverFromRemote(source.url);
              plugins.push(...result.plugins);
              errors.push(...result.errors);
            }
            break;
        }
      } catch (error) {
        errors.push({
          source: source.type,
          message: (error as Error).message,
          path: source.path || source.url,
        });
      }
    }

    return { plugins, errors };
  }

  private async discoverFromFS(basePath: string): Promise<DiscoveryResult> {
    const plugins: CapabilityPlugin[] = [];
    const errors: DiscoveryError[] = [];

    const absolutePath = resolve(basePath);
    const exists = await this.pathExists(absolutePath);
    if (!exists) {
      return { plugins, errors };
    }

    const pluginTypes = ["skills", "tools", "commands", "agents"];

    for (const pluginType of pluginTypes) {
      const typePath = join(absolutePath, pluginType);
      const typeExists = await this.pathExists(typePath);
      if (!typeExists) continue;

      const entries = await readdir(typePath);
      for (const entry of entries) {
        const pluginPath = join(typePath, entry);
        const entryStat = await stat(pluginPath).catch(() => null);
        if (!entryStat?.isDirectory()) continue;

        try {
          const plugin = await this.loadPluginFromPath(pluginPath, pluginType as CapabilityType);
          if (plugin) {
            plugins.push(plugin);
          }
        } catch (error) {
          errors.push({
            source: "filesystem",
            message: (error as Error).message,
            path: pluginPath,
          });
        }
      }
    }

    return { plugins, errors };
  }

  private async loadPluginFromPath(pluginPath: string, type: CapabilityType): Promise<CapabilityPlugin | null> {
    const manifestPath = join(pluginPath, PLUGIN_MANIFEST_FILE);
    const manifestExists = await this.pathExists(manifestPath);

    let manifest: CapabilityManifest;

    if (manifestExists) {
      const content = await readFile(manifestPath, "utf-8");
      manifest = JSON.parse(content) as CapabilityManifest;
    } else {
      const name = pluginPath.split(/[/\\]/).pop() || "unknown";
      manifest = {
        name,
        version: "1.0.0",
        type,
        description: `Plugin loaded from ${pluginPath}`,
        triggers: [name.toLowerCase()],
      };
    }

    const modulePath = join(pluginPath, "index.ts");
    const moduleExists = await this.pathExists(modulePath);

    if (moduleExists) {
      const mod = await import(modulePath);
      const pluginExport = mod.default || Object.values(mod)[0];
      if (pluginExport && typeof pluginExport.activate === "function") {
        return pluginExport as CapabilityPlugin;
      }
    }

    return this.createFallbackPlugin(manifest, pluginPath);
  }

  private createFallbackPlugin(manifest: CapabilityManifest, pluginPath: string): CapabilityPlugin {
    return {
      manifest,
      async activate(_ctx: CapabilityContext) {
        return { type: "fallback", path: pluginPath };
      },
    };
  }

  private async discoverBuiltin(_packages: string[]): Promise<DiscoveryResult> {
    const plugins: CapabilityPlugin[] = [];
    const errors: DiscoveryError[] = [];

    const builtinSkills = [
      {
        name: "dream",
        description: "KAIROS dreaming mode: distill episodic memories into semantic facts",
        triggers: ["dream", "distill", "sleep", "整理记忆"],
      },
      {
        name: "compact",
        description: "Manually compress conversation context",
        triggers: ["compact", "compress", "摘要", "压缩"],
      },
      {
        name: "verify",
        description: "Run verification checks on current changes",
        triggers: ["verify", "test", "check", "验证"],
      },
    ];

    for (const skill of builtinSkills) {
      plugins.push({
        manifest: {
          name: skill.name,
          version: "1.0.0",
          type: CapabilityType.SKILL,
          description: skill.description,
          triggers: skill.triggers,
        },
        async activate(_ctx: CapabilityContext) {
          return { type: "builtin", name: skill.name };
        },
      });
    }

    return { plugins, errors };
  }

  private async discoverFromNPM(_packages: string[]): Promise<DiscoveryResult> {
    const plugins: CapabilityPlugin[] = [];
    const errors: DiscoveryError[] = [];

    for (const pkg of _packages) {
      try {
        const mod = await import(pkg);
        const pluginExport = mod.default || Object.values(mod)[0];
        if (pluginExport && typeof pluginExport.activate === "function") {
          plugins.push(pluginExport as CapabilityPlugin);
        }
      } catch (error) {
        errors.push({
          source: "npm",
          message: (error as Error).message,
        });
      }
    }

    return { plugins, errors };
  }

  private async discoverFromRemote(_url: string): Promise<DiscoveryResult> {
    const plugins: CapabilityPlugin[] = [];
    const errors: DiscoveryError[] = [];

    errors.push({
      source: "remote",
      message: "Remote discovery not yet implemented",
      path: _url,
    });

    return { plugins, errors };
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  validatePlugin(plugin: CapabilityPlugin): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!plugin.manifest.name) {
      errors.push("Missing manifest.name");
    }
    if (!plugin.manifest.version) {
      errors.push("Missing manifest.version");
    }
    if (!plugin.manifest.type) {
      errors.push("Missing manifest.type");
    }
    if (!plugin.manifest.description) {
      errors.push("Missing manifest.description");
    }
    if (typeof plugin.activate !== "function") {
      errors.push("Missing activate function");
    }

    return { valid: errors.length === 0, errors };
  }

  resolveDependencies(plugins: CapabilityPlugin[]): CapabilityPlugin[] {
    const resolved: CapabilityPlugin[] = [];
    const visited = new Set<string>();

    const visit = (plugin: CapabilityPlugin) => {
      if (visited.has(plugin.manifest.name)) return;
      visited.add(plugin.manifest.name);

      const deps = plugin.manifest.dependencies || [];
      for (const depName of deps) {
        const dep = plugins.find((p) => p.manifest.name === depName);
        if (dep) {
          visit(dep);
        }
      }

      resolved.push(plugin);
    };

    for (const plugin of plugins) {
      visit(plugin);
    }

    return resolved;
  }
}
