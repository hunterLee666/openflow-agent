import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { z } from "zod";

// .openflow 目录规范常量
const OPENFLOW_DIR = ".openflow";
const MEMORY_FILES = ["OPENFLOW.md", "OPENFLOW.local.md"];
const SETTINGS_FILE = "settings.json";
const LOCAL_SETTINGS_FILE = "settings.local.json";
const RULES_DIR = "rules";
const SKILLS_DIR = "skills";
const AGENTS_DIR = "agents";
const COMMANDS_DIR = "commands";
const HOOKS_FILE = "hooks.json";
const MCP_FILE = ".mcp.json";
const LSP_FILE = ".lsp.json";
const OUTPUT_STYLES_DIR = "outputStyles";

// Zod Schemas
export const ConfigLayerSchema = z.enum(["enterprise", "user", "project"]);
export type ConfigLayer = z.infer<typeof ConfigLayerSchema>;

export const PermissionRuleSchema = z.object({
  name: z.string(),
  action: z.enum(["deny", "ask", "allow"]),
  tool: z.string().optional(),
  pattern: z.string().optional(),
  pathRegex: z.string().optional(),
  note: z.string().optional(),
  priority: z.number().optional(),
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

export const LayeredArraySchema = z.object({
  enterprise: z.array(z.string()),
  user: z.array(z.string()),
  project: z.array(z.string()),
});

export const LayeredAgentsSchema = z.object({
  enterprise: z.array(AgentDefinitionSchema),
  user: z.array(AgentDefinitionSchema),
  project: z.array(AgentDefinitionSchema),
});

export const LayeredSkillsSchema = z.object({
  enterprise: z.array(SkillDefinitionSchema),
  user: z.array(SkillDefinitionSchema),
  project: z.array(SkillDefinitionSchema),
});

export const LayeredCommandsSchema = z.object({
  enterprise: z.array(CommandDefinitionSchema),
  user: z.array(CommandDefinitionSchema),
  project: z.array(CommandDefinitionSchema),
});

export const DiscoveredContentSchema = z.object({
  memory: LayeredArraySchema,
  rules: LayeredArraySchema,
  agents: LayeredAgentsSchema,
  skills: LayeredSkillsSchema,
  commands: LayeredCommandsSchema,
  settings: OpenFlowSettingsSchema,
});

export type DiscoveredContent = z.infer<typeof DiscoveredContentSchema>;

export const ConfigDirSchema = z.object({
  path: z.string(),
  layer: ConfigLayerSchema,
  dirName: z.string(),
});

export type ConfigDir = z.infer<typeof ConfigDirSchema>;

export class LayeredConfigLoader {
  private projectDir: string;
  private enterpriseDir?: string;

  constructor(projectDir: string, enterpriseDir?: string) {
    this.projectDir = resolve(projectDir);
    this.enterpriseDir = enterpriseDir;
  }

  async loadAll(): Promise<DiscoveredContent> {
    const content: DiscoveredContent = {
      memory: { enterprise: [], user: [], project: [] },
      rules: { enterprise: [], user: [], project: [] },
      agents: { enterprise: [], user: [], project: [] },
      skills: { enterprise: [], user: [], project: [] },
      commands: { enterprise: [], user: [], project: [] },
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

    // 1. Enterprise 层 (最高优先级)
    if (this.enterpriseDir && existsSync(this.enterpriseDir)) {
      const path = join(this.enterpriseDir, OPENFLOW_DIR);
      if (existsSync(path)) {
        dirs.push({ path, layer: "enterprise", dirName: OPENFLOW_DIR });
      }
    }

    // 2. User 层 (~/.config/.openflow 或 ~/.openflow)
    const userConfigDirs = [
      join(homedir(), ".config", OPENFLOW_DIR),
      join(homedir(), ".openflow"),
    ];

    for (const path of userConfigDirs) {
      if (existsSync(path)) {
        dirs.push({ path, layer: "user", dirName: OPENFLOW_DIR });
        break; // 只使用第一个找到的
      }
    }

    // 3. Project 层 (最低优先级)
    const projectPath = join(this.projectDir, OPENFLOW_DIR);
    if (existsSync(projectPath)) {
      dirs.push({ path: projectPath, layer: "project", dirName: OPENFLOW_DIR });
    }

    return dirs;
  }

  private async loadFromDir(dir: ConfigDir, content: DiscoveredContent): Promise<void> {
    const layer = dir.layer;

    // 加载记忆文件 (OPENFLOW.md, OPENFLOW.local.md)
    for (const file of MEMORY_FILES) {
      const path = join(dir.path, file);
      if (existsSync(path)) {
        content.memory[layer].push(path);
      }
    }

    // 加载规则文件 (rules/*.md)
    const rulesPath = join(dir.path, RULES_DIR);
    if (existsSync(rulesPath)) {
      const files = await readdir(rulesPath);
      for (const file of files) {
        if (file.endsWith(".md")) {
          content.rules[layer].push(join(rulesPath, file));
        }
      }
    }

    // 加载子代理定义 (agents/*.yaml)
    const agentsPath = join(dir.path, AGENTS_DIR);
    if (existsSync(agentsPath)) {
      const files = await readdir(agentsPath);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          const content_str = await readFile(join(agentsPath, file), "utf-8");
          const parsed = this.safeParseYaml(content_str);
          if (parsed) {
            const validated = AgentDefinitionSchema.safeParse(parsed);
            if (validated.success) {
              content.agents[layer].push(validated.data);
            }
          }
        }
      }
    }

    // 加载技能定义 (skills/*.yaml)
    const skillsPath = join(dir.path, SKILLS_DIR);
    if (existsSync(skillsPath)) {
      const files = await readdir(skillsPath);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          const content_str = await readFile(join(skillsPath, file), "utf-8");
          const parsed = this.safeParseYaml(content_str);
          if (parsed) {
            const validated = SkillDefinitionSchema.safeParse(parsed);
            if (validated.success) {
              content.skills[layer].push(validated.data);
            }
          }
        }
      }
    }

    // 加载命令定义 (commands/*.yaml)
    const commandsPath = join(dir.path, COMMANDS_DIR);
    if (existsSync(commandsPath)) {
      const files = await readdir(commandsPath);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          const content_str = await readFile(join(commandsPath, file), "utf-8");
          const parsed = this.safeParseYaml(content_str);
          if (parsed) {
            const validated = CommandDefinitionSchema.safeParse(parsed);
            if (validated.success) {
              content.commands[layer].push(validated.data);
            }
          }
        }
      }
    }

    // 加载 settings.json 和 settings.local.json
    // settings.local.json 优先级更高
    const settingsPath = join(dir.path, SETTINGS_FILE);
    if (existsSync(settingsPath)) {
      const settingsContent = await readFile(settingsPath, "utf-8");
      const parsed = JSON.parse(settingsContent);
      const validated = OpenFlowSettingsSchema.safeParse(parsed);
      if (validated.success) {
        content.settings = this.mergeSettings(content.settings, validated.data);
      }
    }

    const localSettingsPath = join(dir.path, LOCAL_SETTINGS_FILE);
    if (existsSync(localSettingsPath)) {
      const localSettingsContent = await readFile(localSettingsPath, "utf-8");
      const parsed = JSON.parse(localSettingsContent);
      const validated = OpenFlowSettingsSchema.safeParse(parsed);
      if (validated.success) {
        content.settings = this.mergeSettings(content.settings, validated.data);
      }
    }
  }

  private mergeSettings(base: OpenFlowSettings, override: Partial<OpenFlowSettings>): OpenFlowSettings {
    return {
      ...base,
      ...override,
      permissions: {
        ...base.permissions,
        ...override.permissions,
      },
      plugins: {
        ...base.plugins,
        ...override.plugins,
      },
    };
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
