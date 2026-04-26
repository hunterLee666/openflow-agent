import { readFile, readdir, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { z } from "zod";
import type { CapabilityContext } from "../types/index.js";

const CONFIG_DIR_NAMES = [".openflow"];
const MEMORY_FILES = ["OPENFLOW.md"];
const LOCAL_MEMORY_FILES = ["OPENFLOW.local.md"];
const SETTINGS_FILE = "settings.json";
const LOCAL_SETTINGS_FILE = "settings.local.json";

export const ConfigLayerSchema = z.enum(["enterprise", "user", "project"]);

export type ConfigLayer = z.infer<typeof ConfigLayerSchema>;

export const PermissionRuleSchema = z.object({
  name: z.string(),
  action: z.enum(["deny", "ask", "allow"]),
  tool: z.string().optional(),
  pattern: z.string().optional(),
  pathRegex: z.string().optional(),
  note: z.string().optional(),
});

export const PermissionsConfigSchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
  additionalDirectories: z.array(z.string()).optional(),
  defaultMode: z.enum(["default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions"]).optional(),
  sandbox: z.boolean().optional(),
  rules: z.array(PermissionRuleSchema).optional(),
});

export const HookConfigSchema = z.object({
  matcher: z.string(),
  command: z.string(),
  timeout: z.number().optional(),
});

export const PluginSourceSchema = z.object({
  type: z.string(),
  path: z.string().optional(),
  url: z.string().optional(),
});

export const OpenFlowSettingsSchema = z.object({
  permissions: PermissionsConfigSchema.optional(),
  hooks: z.record(z.string(), z.array(HookConfigSchema)).optional(),
  env: z.record(z.string(), z.string()).optional(),
  model: z.string().optional(),
  mcpServers: z.record(z.string(), z.object({
    command: z.string(),
    args: z.array(z.string()),
    env: z.record(z.string(), z.string()).optional(),
  })).optional(),
  plugins: z.object({
    enabled: z.array(z.string()).optional(),
    disabled: z.array(z.string()).optional(),
    sources: z.array(PluginSourceSchema).optional(),
  }).optional(),
});

export type OpenFlowSettings = z.infer<typeof OpenFlowSettingsSchema>;

export const AgentDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  tools: z.array(z.string()).optional(),
  model: z.string().optional(),
  skills: z.array(z.string()).optional(),
  permissionMode: z.enum(["default", "acceptEdits", "bypassPermissions", "plan", "auto", "dontAsk"]).optional(),
  source: z.string().optional(),
});

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const SkillDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  allowedTools: z.array(z.string()).optional(),
  triggers: z.array(z.string()).optional(),
  instructions: z.string(),
  source: z.string().optional(),
});

export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export const CommandDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  allowedTools: z.array(z.string()).optional(),
  argumentHint: z.string().optional(),
  template: z.string(),
  source: z.string().optional(),
});

export type CommandDefinition = z.infer<typeof CommandDefinitionSchema>;

export const DiscoveredContentSchema = z.object({
  memory: z.array(z.string()),
  rules: z.array(z.string()),
  agents: z.array(AgentDefinitionSchema),
  skills: z.array(SkillDefinitionSchema),
  commands: z.array(CommandDefinitionSchema),
  settings: OpenFlowSettingsSchema,
});

export type DiscoveredContent = z.infer<typeof DiscoveredContentSchema>;

export const ConfigDirSchema = z.object({
  path: z.string(),
  layer: ConfigLayerSchema,
  dirName: z.string(),
});

type ConfigDir = z.infer<typeof ConfigDirSchema>;

export class LayeredConfigLoader {
  private projectDir: string;
  private enterpriseDir?: string;

  constructor(projectDir: string, enterpriseDir?: string) {
    this.projectDir = resolve(projectDir);
    this.enterpriseDir = enterpriseDir;
  }

  async loadAll(): Promise<DiscoveredContent> {
    const content: DiscoveredContent = {
      memory: [],
      rules: [],
      agents: [],
      skills: [],
      commands: [],
      settings: {},
    };

    const configDirs = await this.findConfigDirs();

    for (const dir of configDirs) {
      await this.loadFromDir(dir, content);
    }

    return content;
  }

  async loadSettings(): Promise<OpenFlowSettings> {
    const discovered = await this.loadAll();
    return discovered.settings;
  }

  private async findConfigDirs(): Promise<ConfigDir[]> {
    const dirs: ConfigDir[] = [];

    if (this.enterpriseDir && existsSync(this.enterpriseDir)) {
      for (const dirName of CONFIG_DIR_NAMES) {
        const path = join(this.enterpriseDir, dirName);
        if (existsSync(path)) {
          dirs.push({ path, layer: "enterprise" as const, dirName });
        }
      }
    }

    const userConfigDir = join(homedir(), ".config");
    for (const dirName of CONFIG_DIR_NAMES) {
      const path = join(userConfigDir, dirName);
      if (existsSync(path)) {
        dirs.push({ path, layer: "user" as const, dirName });
      }
    }

    for (const dirName of CONFIG_DIR_NAMES) {
      const path = join(this.projectDir, dirName);
      if (existsSync(path)) {
        dirs.push({ path, layer: "project" as const, dirName });
      }
    }

    return dirs;
  }

  private async loadFromDir(dir: ConfigDir, content: DiscoveredContent): Promise<void> {
    for (const file of MEMORY_FILES) {
      const path = join(dir.path, file);
      if (existsSync(path)) {
        content.memory.push(path);
      }
    }

    for (const file of LOCAL_MEMORY_FILES) {
      const path = join(dir.path, file);
      if (existsSync(path)) {
        content.memory.push(path);
      }
    }

    const rulesPath = join(dir.path, "rules");
    if (existsSync(rulesPath)) {
      const files = await readdir(rulesPath);
      for (const file of files) {
        if (file.endsWith(".md")) {
          content.rules.push(join(rulesPath, file));
        }
      }
    }

    const agentsPath = join(dir.path, "agents");
    if (existsSync(agentsPath)) {
      const files = await readdir(agentsPath);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          const content_str = await readFile(join(agentsPath, file), "utf-8");
          const parsed = this.safeParseYaml(content_str);
          if (parsed) {
            const validated = AgentDefinitionSchema.safeParse(parsed);
            if (validated.success) {
              content.agents.push(validated.data);
            }
          }
        }
      }
    }

    const skillsPath = join(dir.path, "skills");
    if (existsSync(skillsPath)) {
      const files = await readdir(skillsPath);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          const content_str = await readFile(join(skillsPath, file), "utf-8");
          const parsed = this.safeParseYaml(content_str);
          if (parsed) {
            const validated = SkillDefinitionSchema.safeParse(parsed);
            if (validated.success) {
              content.skills.push(validated.data);
            }
          }
        }
      }
    }

    const commandsPath = join(dir.path, "commands");
    if (existsSync(commandsPath)) {
      const files = await readdir(commandsPath);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          const content_str = await readFile(join(commandsPath, file), "utf-8");
          const parsed = this.safeParseYaml(content_str);
          if (parsed) {
            const validated = CommandDefinitionSchema.safeParse(parsed);
            if (validated.success) {
              content.commands.push(validated.data);
            }
          }
        }
      }
    }

    const settingsPath = join(dir.path, SETTINGS_FILE);
    if (existsSync(settingsPath)) {
      const settingsContent = await readFile(settingsPath, "utf-8");
      const parsed = JSON.parse(settingsContent);
      const validated = OpenFlowSettingsSchema.safeParse(parsed);
      if (validated.success) {
        content.settings = { ...content.settings, ...validated.data };
      }
    }

    const localSettingsPath = join(dir.path, LOCAL_SETTINGS_FILE);
    if (existsSync(localSettingsPath)) {
      const localSettingsContent = await readFile(localSettingsPath, "utf-8");
      const parsed = JSON.parse(localSettingsContent);
      const validated = OpenFlowSettingsSchema.safeParse(parsed);
      if (validated.success) {
        content.settings = { ...content.settings, ...validated.data };
      }
    }
  }

  private safeParseYaml(content: string): Record<string, unknown> | null {
    try {
      const lines = content.split("\n");
      const result: Record<string, unknown> = {};
      let currentKey = "";
      let currentValue = "";

      for (const line of lines) {
        if (line.includes(":") && !line.startsWith(" ") && !line.startsWith("-")) {
          if (currentKey) {
            result[currentKey] = currentValue.trim();
          }
          const [key, ...rest] = line.split(":");
          currentKey = key.trim();
          currentValue = rest.join(":");
        } else {
          currentValue += "\n" + line;
        }
      }

      if (currentKey) {
        result[currentKey] = currentValue.trim();
      }

      return result;
    } catch {
      return null;
    }
  }
}

export function createLayeredConfigLoader(projectDir: string, enterpriseDir?: string): LayeredConfigLoader {
  return new LayeredConfigLoader(projectDir, enterpriseDir);
}
