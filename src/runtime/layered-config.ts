import { readFile, readdir, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { CapabilityContext } from "../types/index.js";

const CONFIG_DIR_NAMES = [".openflow"];
const MEMORY_FILES = ["OPENFLOW.md", "CLAUDE.md"];
const LOCAL_MEMORY_FILES = ["OPENFLOW.local.md", "CLAUDE.local.md"];
const SETTINGS_FILE = "settings.json";
const LOCAL_SETTINGS_FILE = "settings.local.json";

export enum ConfigLayer {
  ENTERPRISE = "enterprise",
  USER = "user",
  PROJECT = "project",
}

export interface OpenFlowSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    additionalDirectories?: string[];
    defaultMode?: "default" | "acceptEdits" | "plan" | "auto" | "dontAsk" | "bypassPermissions";
    sandbox?: boolean;
    rules?: Array<{
      name: string;
      action: "deny" | "ask" | "allow";
      tool?: string;
      pattern?: string;
      pathRegex?: string;
      note?: string;
    }>;
  };
  hooks?: Record<string, Array<{ matcher: string; command: string; timeout?: number }>>;
  env?: Record<string, string>;
  model?: string;
  mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>;
  plugins?: {
    enabled?: string[];
    disabled?: string[];
    sources?: Array<{ type: string; path?: string; url?: string }>;
  };
}

export interface AgentDefinition {
  name: string;
  description: string;
  systemPrompt: string;
  tools?: string[];
  model?: string;
  skills?: string[];
  permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "auto" | "dontAsk";
  source?: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  allowedTools?: string[];
  triggers?: string[];
  instructions: string;
  source?: string;
}

export interface CommandDefinition {
  name: string;
  description: string;
  allowedTools?: string[];
  argumentHint?: string;
  template: string;
  source?: string;
}

export interface DiscoveredContent {
  memory: string[];
  rules: string[];
  agents: AgentDefinition[];
  skills: SkillDefinition[];
  commands: CommandDefinition[];
  settings: OpenFlowSettings;
}

interface ConfigDir {
  path: string;
  layer: ConfigLayer;
  dirName: string;
}

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

    const dirs = this.resolveConfigDirs();

    for (const dir of dirs) {
      await this.loadMemoryFromDir(dir, content);
      await this.loadSettingsFromDir(dir, content);
      await this.loadAgentsFromDir(dir, content);
      await this.loadSkillsFromDir(dir, content);
      await this.loadCommandsFromDir(dir, content);
      await this.loadRulesFromDir(dir, content);
    }

    await this.loadRootMemory(content);

    return content;
  }

  async loadMemory(): Promise<string[]> {
    const content: DiscoveredContent = {
      memory: [],
      rules: [],
      agents: [],
      skills: [],
      commands: [],
      settings: {},
    };

    const dirs = this.resolveConfigDirs();
    for (const dir of dirs) {
      await this.loadMemoryFromDir(dir, content);
    }
    await this.loadRootMemory(content);

    return content.memory;
  }

  async loadSettings(): Promise<OpenFlowSettings> {
    const dirs = this.resolveConfigDirs();
    let merged: OpenFlowSettings = {};

    for (const dir of dirs) {
      await this.loadSettingsFromDir(dir, { memory: [], rules: [], agents: [], skills: [], commands: [], settings: merged });
      merged = { memory: [], rules: [], agents: [], skills: [], commands: [], settings: merged }.settings;
    }

    return merged;
  }

  async loadAgents(): Promise<AgentDefinition[]> {
    const content: DiscoveredContent = {
      memory: [],
      rules: [],
      agents: [],
      skills: [],
      commands: [],
      settings: {},
    };

    const dirs = this.resolveConfigDirs();
    for (const dir of dirs) {
      await this.loadAgentsFromDir(dir, content);
    }

    return content.agents;
  }

  async loadSkills(): Promise<SkillDefinition[]> {
    const content: DiscoveredContent = {
      memory: [],
      rules: [],
      agents: [],
      skills: [],
      commands: [],
      settings: {},
    };

    const dirs = this.resolveConfigDirs();
    for (const dir of dirs) {
      await this.loadSkillsFromDir(dir, content);
    }

    return content.skills;
  }

  async loadCommands(): Promise<CommandDefinition[]> {
    const content: DiscoveredContent = {
      memory: [],
      rules: [],
      agents: [],
      skills: [],
      commands: [],
      settings: {},
    };

    const dirs = this.resolveConfigDirs();
    for (const dir of dirs) {
      await this.loadCommandsFromDir(dir, content);
    }

    return content.commands;
  }

  async loadRules(): Promise<string[]> {
    const content: DiscoveredContent = {
      memory: [],
      rules: [],
      agents: [],
      skills: [],
      commands: [],
      settings: {},
    };

    const dirs = this.resolveConfigDirs();
    for (const dir of dirs) {
      await this.loadRulesFromDir(dir, content);
    }

    return content.rules;
  }

  private resolveConfigDirs(): ConfigDir[] {
    const dirs: ConfigDir[] = [];
    const seen = new Set<string>();

    const addDir = (path: string, layer: ConfigLayer) => {
      if (seen.has(path)) return;
      seen.add(path);

      for (const dirName of CONFIG_DIR_NAMES) {
        const fullPath = join(path, dirName);
        if (existsSync(fullPath)) {
          dirs.push({ path: fullPath, layer, dirName });
        }
      }
    };

    if (this.enterpriseDir) {
      addDir(this.enterpriseDir, ConfigLayer.ENTERPRISE);
    }

    addDir(join(homedir()), ConfigLayer.USER);
    addDir(this.projectDir, ConfigLayer.PROJECT);

    return dirs;
  }

  private async loadMemoryFromDir(dir: ConfigDir, content: DiscoveredContent): Promise<void> {
    for (const memoryFile of MEMORY_FILES) {
      const memoryPath = join(dir.path, memoryFile);
      if (await this.pathExists(memoryPath)) {
        const tag = `[${dir.layer}:${dir.dirName}]`;
        content.memory.push(`${tag}\n\n${await readFile(memoryPath, "utf-8")}`);
      }
    }

    for (const localFile of LOCAL_MEMORY_FILES) {
      const localPath = join(dir.path, localFile);
      if (await this.pathExists(localPath)) {
        const tag = `[${dir.layer}:${dir.dirName}:local]`;
        content.memory.push(`${tag}\n\n${await readFile(localPath, "utf-8")}`);
      }
    }
  }

  private async loadRootMemory(content: DiscoveredContent): Promise<void> {
    for (const memoryFile of MEMORY_FILES) {
      const rootPath = join(this.projectDir, memoryFile);
      if (await this.pathExists(rootPath)) {
        content.memory.push(`[project-root:${memoryFile}]\n\n${await readFile(rootPath, "utf-8")}`);
      }
    }

    for (const localFile of LOCAL_MEMORY_FILES) {
      const rootLocalPath = join(this.projectDir, localFile);
      if (await this.pathExists(rootLocalPath)) {
        content.memory.push(`[project-root:${localFile}]\n\n${await readFile(rootLocalPath, "utf-8")}`);
      }
    }
  }

  private async loadSettingsFromDir(dir: ConfigDir, content: DiscoveredContent): Promise<void> {
    const settingsPath = join(dir.path, SETTINGS_FILE);
    if (await this.pathExists(settingsPath)) {
      const settings = JSON.parse(await readFile(settingsPath, "utf-8")) as OpenFlowSettings;
      content.settings = this.mergeSettings(content.settings, settings);
    }

    const localSettingsPath = join(dir.path, LOCAL_SETTINGS_FILE);
    if (await this.pathExists(localSettingsPath)) {
      const localSettings = JSON.parse(await readFile(localSettingsPath, "utf-8")) as OpenFlowSettings;
      content.settings = this.mergeSettings(content.settings, localSettings);
    }
  }

  private async loadAgentsFromDir(dir: ConfigDir, content: DiscoveredContent): Promise<void> {
    const agentsDir = join(dir.path, "agents");
    if (!(await this.pathExists(agentsDir))) return;

    const entries = await readdir(agentsDir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;

      const agentPath = join(agentsDir, entry);
      const content_str = await readFile(agentPath, "utf-8");
      const agent = this.parseAgentMarkdown(content_str, entry.replace(".md", ""), dir);
      if (agent) {
        content.agents.push(agent);
      }
    }
  }

  private async loadSkillsFromDir(dir: ConfigDir, content: DiscoveredContent): Promise<void> {
    const skillsDir = join(dir.path, "skills");
    if (!(await this.pathExists(skillsDir))) return;

    const entries = await readdir(skillsDir);
    for (const entry of entries) {
      const skillDirPath = join(skillsDir, entry);
      if (!(await this.pathExists(skillDirPath))) continue;

      const stat = await this.statPath(skillDirPath);
      if (!stat.isDirectory()) continue;

      const skillMdPath = join(skillDirPath, "SKILL.md");
      if (!(await this.pathExists(skillMdPath))) continue;

      const content_str = await readFile(skillMdPath, "utf-8");
      const skill = this.parseSkillMarkdown(content_str, entry, dir);
      if (skill) {
        content.skills.push(skill);
      }
    }
  }

  private async loadCommandsFromDir(dir: ConfigDir, content: DiscoveredContent): Promise<void> {
    const commandsDir = join(dir.path, "commands");
    if (!(await this.pathExists(commandsDir))) return;

    await this.loadCommandsRecursive(commandsDir, content.commands, dir);
  }

  private async loadCommandsRecursive(dirPath: string, commands: CommandDefinition[], dir: ConfigDir): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.loadCommandsRecursive(entryPath, commands, dir);
      } else if (entry.name.endsWith(".md")) {
        const content_str = await readFile(entryPath, "utf-8");
        const command = this.parseCommandMarkdown(content_str, entry.name.replace(".md", ""), dir);
        if (command) {
          commands.push(command);
        }
      }
    }
  }

  private async loadRulesFromDir(dir: ConfigDir, content: DiscoveredContent): Promise<void> {
    const rulesDir = join(dir.path, "rules");
    if (!(await this.pathExists(rulesDir))) return;

    await this.loadRulesRecursive(rulesDir, content.rules, dir);
  }

  private async loadRulesRecursive(dirPath: string, rules: string[], dir: ConfigDir): Promise<void> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.loadRulesRecursive(entryPath, rules, dir);
      } else if (entry.name.endsWith(".md")) {
        const content = await readFile(entryPath, "utf-8");
        rules.push(`# [${dir.layer}:${dir.dirName}] ${entry.name}\n\n${content}`);
      }
    }
  }

  private mergeSettings(base: OpenFlowSettings, override: OpenFlowSettings): OpenFlowSettings {
    return {
      ...base,
      ...override,
      permissions: {
        ...base.permissions,
        ...override.permissions,
        allow: [...(base.permissions?.allow || []), ...(override.permissions?.allow || [])],
        deny: [...(base.permissions?.deny || []), ...(override.permissions?.deny || [])],
      },
      env: {
        ...base.env,
        ...override.env,
      },
      hooks: {
        ...base.hooks,
        ...override.hooks,
      },
      mcpServers: {
        ...base.mcpServers,
        ...override.mcpServers,
      },
      plugins: {
        ...base.plugins,
        ...override.plugins,
        enabled: [...(base.plugins?.enabled || []), ...(override.plugins?.enabled || [])],
        disabled: [...(base.plugins?.disabled || []), ...(override.plugins?.disabled || [])],
      },
    };
  }

  private parseAgentMarkdown(content: string, fileName: string, dir: ConfigDir): AgentDefinition | null {
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) return null;

    const frontMatter = frontMatterMatch[1];
    const body = content.slice(frontMatterMatch[0].length).trim();

    const name = frontMatter.match(/name:\s*(.*)/)?.[1]?.trim();
    if (!name) return null;

    const description = frontMatter.match(/description:\s*(.*)/)?.[1]?.trim() || "";
    const tools = frontMatter.match(/tools:\s*(.*)/)?.[1]?.split(",").map((t) => t.trim());
    const model = frontMatter.match(/model:\s*(.*)/)?.[1]?.trim();
    const skills = frontMatter.match(/skills:\s*(.*)/)?.[1]?.split(",").map((s) => s.trim());
    const permissionMode = frontMatter.match(/permissionMode:\s*(.*)/)?.[1]?.trim() as AgentDefinition["permissionMode"];

    return {
      name,
      description,
      systemPrompt: body,
      tools,
      model,
      skills,
      permissionMode,
      source: `${dir.layer}:${dir.dirName}`,
    };
  }

  private parseSkillMarkdown(content: string, folderName: string, dir: ConfigDir): SkillDefinition | null {
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) return null;

    const frontMatter = frontMatterMatch[1];
    const body = content.slice(frontMatterMatch[0].length).trim();

    const name = frontMatter.match(/name:\s*(.*)/)?.[1]?.trim() || folderName;
    const description = frontMatter.match(/description:\s*(.*)/)?.[1]?.trim() || "";
    const allowedTools = frontMatter.match(/allowed-tools:\s*(.*)/)?.[1]?.split(",").map((t) => t.trim());
    const triggers = frontMatter.match(/triggers:\s*(.*)/)?.[1]?.split(",").map((t) => t.trim());

    return {
      name,
      description,
      allowedTools,
      triggers,
      instructions: body,
      source: `${dir.layer}:${dir.dirName}`,
    };
  }

  private parseCommandMarkdown(content: string, fileName: string, dir: ConfigDir): CommandDefinition | null {
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontMatterMatch) return null;

    const frontMatter = frontMatterMatch[1];
    const body = content.slice(frontMatterMatch[0].length).trim();

    const description = frontMatter.match(/description:\s*(.*)/)?.[1]?.trim() || "";
    const allowedTools = frontMatter.match(/allowed-tools:\s*(.*)/)?.[1]?.split(",").map((t) => t.trim());
    const argumentHint = frontMatter.match(/argument-hint:\s*(.*)/)?.[1]?.trim();

    return {
      name: fileName,
      description,
      allowedTools,
      argumentHint,
      template: body,
      source: `${dir.layer}:${dir.dirName}`,
    };
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async statPath(path: string) {
    const { stat } = await import("node:fs/promises");
    return stat(path);
  }
}
