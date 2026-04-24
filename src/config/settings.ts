import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { PermissionSettings, PermissionRule, PermissionRuleContent } from "../permissions/types.js";
import { SOURCE_PRIORITY } from "../permissions/types.js";

export interface OpenflowSettings {
  version: number;
  permissions?: {
    alwaysAllow?: PermissionRuleContent[];
    alwaysAsk?: PermissionRuleContent[];
    alwaysDeny?: PermissionRuleContent[];
  };
  workspace?: {
    root?: string;
    allowedPaths?: string[];
    deniedPaths?: string[];
  };
  agent?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  memory?: {
    enabled?: boolean;
    maxSize?: number;
    retentionDays?: number;
  };
  ui?: {
    theme?: "light" | "dark" | "auto";
    compactMode?: boolean;
  };
}

export class SettingsLoader {
  private settingsCache: Map<string, OpenflowSettings> = new Map();
  private configPaths: Map<string, string> = new Map();

  constructor(
    private homeDir: string,
    private projectDir: string
  ) {
    this.configPaths.set("userSettings", join(this.homeDir, ".openflow", "settings.json"));
    this.configPaths.set("projectSettings", join(this.projectDir, ".openflow", "settings.json"));
    this.configPaths.set("localSettings", join(this.projectDir, ".openflow", "settings.local.json"));
  }

  load(source: "userSettings" | "projectSettings" | "localSettings"): OpenflowSettings | null {
    const cached = this.settingsCache.get(source);
    if (cached) {
      return cached;
    }

    const path = this.configPaths.get(source);
    if (!path || !existsSync(path)) {
      return null;
    }

    try {
      const content = readFileSync(path, "utf-8");
      const settings = JSON.parse(content) as OpenflowSettings;
      this.settingsCache.set(source, settings);
      return settings;
    } catch (error) {
      console.error(`Failed to load settings from ${path}:`, error);
      return null;
    }
  }

  loadAll(): Map<string, OpenflowSettings> {
    const results = new Map<string, OpenflowSettings>();

    for (const source of ["userSettings", "projectSettings", "localSettings"] as const) {
      const settings = this.load(source);
      if (settings) {
        results.set(source, settings);
      }
    }

    return results;
  }

  save(source: "userSettings" | "projectSettings" | "localSettings", settings: OpenflowSettings): void {
    const path = this.configPaths.get(source);
    if (!path) {
      throw new Error(`Unknown settings source: ${source}`);
    }

    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    try {
      writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
      this.settingsCache.set(source, settings);
    } catch (error) {
      console.error(`Failed to save settings to ${path}:`, error);
      throw error;
    }
  }

  mergeWithDefaults(defaults: OpenflowSettings): OpenflowSettings {
    return defaults;
  }

  getPermissionRules(source: "userSettings" | "projectSettings" | "localSettings"): PermissionRule[] {
    const settings = this.load(source);
    if (!settings?.permissions) {
      return [];
    }

    const rules: PermissionRule[] = [];
    const { permissions } = settings;

    if (permissions.alwaysAllow) {
      for (const content of permissions.alwaysAllow) {
        rules.push(this.createRule("allow", content, source));
      }
    }

    if (permissions.alwaysAsk) {
      for (const content of permissions.alwaysAsk) {
        rules.push(this.createRule("ask", content, source));
      }
    }

    if (permissions.alwaysDeny) {
      for (const content of permissions.alwaysDeny) {
        rules.push(this.createRule("deny", content, source));
      }
    }

    return rules;
  }

  private createRule(
    behavior: "allow" | "ask" | "deny",
    content: PermissionRuleContent,
    source: "userSettings" | "projectSettings" | "localSettings"
  ): PermissionRule {
    return {
      id: `${behavior}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source,
      behavior,
      priority: SOURCE_PRIORITY[source],
      ruleContent: content,
      description: `${source} ${behavior} rule`,
      createdAt: Date.now(),
    };
  }

  clearCache(): void {
    this.settingsCache.clear();
  }
}

export const DEFAULT_SETTINGS: OpenflowSettings = {
  version: 1,
  permissions: {
    alwaysAllow: [
      { toolName: "read" },
      { toolName: "read_file" },
      { pathPattern: "src/**" },
      { pathPattern: "*.ts" },
      { pathPattern: "*.tsx" },
      { pathPattern: "*.json" },
      { pathPattern: "*.md" },
    ],
    alwaysAsk: [
      { toolName: "bash", commandPattern: "npm *" },
      { toolName: "bash", commandPattern: "yarn *" },
      { toolName: "bash", commandPattern: "pip *" },
    ],
    alwaysDeny: [
      { pathPattern: "/.git/**" },
      { pathPattern: "/.ssh/**" },
      { pathPattern: "/.aws/**" },
      { pathPattern: "/etc/passwd" },
      { pathPattern: "/etc/shadow" },
    ],
  },
  workspace: {
    deniedPaths: ["/.git/", "/.ssh/", "/.aws/", "/etc/passwd", "/etc/shadow"],
  },
  agent: {
    model: "claude-3-5-sonnet-20241022",
    temperature: 0.7,
    maxTokens: 4096,
  },
  memory: {
    enabled: true,
    maxSize: 10 * 1024 * 1024,
    retentionDays: 30,
  },
  ui: {
    theme: "auto",
    compactMode: false,
  },
};

export function getDefaultSettings(): OpenflowSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}