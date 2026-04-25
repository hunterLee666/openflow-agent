import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import { ExplorationSecurity, createExplorationSecurity, SecurityPolicy } from "./exploration-security.js";
import { ExplorationDesensitizer, createExplorationDesensitizer } from "./exploration-desensitizer.js";
import type { ValidationResult, SecurityViolation } from "./exploration-security.js";
import type { DesensitizationResult } from "./exploration-desensitizer.js";

const execAsync = promisify(exec);

export interface ExplorationContext {
  baseline: BaselineContext;
  taskDriven: TaskDrivenContext;
  layeredMemory: LayeredMemory;
  explorationHistory: ExplorationStep[];
}

export interface BaselineContext {
  identity: IdentityInfo;
  user: UserInfo;
  workspace: WorkspaceBaseline;
  runtime: RuntimeBaseline;
  tools: ToolRegistry;
  skills: SkillRegistry;
  memory: MemoryBaseline;
  time: TimeInfo;
}

export interface IdentityInfo {
  name: string;
  role: string;
  personality: string;
  constraints: string[];
}

export interface UserInfo {
  name: string;
  preferences: string[];
  technicalLevel: string;
  communicationStyle: string;
}

export interface WorkspaceBaseline {
  rootPath: string;
  structure: DirectoryTree;
  projectType: string;
  conventions: string[];
  configFiles: ConfigFile[];
  gitState: GitState;
}

export interface RuntimeBaseline {
  os: OSInfo;
  nodeVersion: string;
  npmVersion: string;
  shell: string;
  env: Record<string, string>;
  sandbox: SandboxInfo;
}

export interface ToolRegistry {
  available: ToolInfo[];
  groups: Record<string, string[]>;
  profiles: Record<string, string[]>;
}

export interface SkillRegistry {
  available: SkillInfo[];
  loaded: SkillInfo[];
}

export interface MemoryBaseline {
  shortTerm: ShortTermMemory[];
  longTerm: LongTermMemory;
  procedural: ProceduralMemory[];
}

export interface TimeInfo {
  iso: string;
  timezone: string;
  unixTimestamp: number;
}

export interface OSInfo {
  platform: string;
  release: string;
  arch: string;
  hostname: string;
  cpuCount: number;
  totalMemory: number;
}

export interface SandboxInfo {
  enabled: boolean;
  mode: string;
  allowedPaths: string[];
  elevatedExec: boolean;
}

export interface DirectoryTree {
  name: string;
  type: "file" | "directory";
  children?: DirectoryTree[];
  size?: number;
  modifiedAt?: string;
}

export interface ConfigFile {
  name: string;
  path: string;
  content: string;
  truncated: boolean;
}

export interface GitState {
  branch: string;
  status: string;
  lastCommit: string;
  remote: string;
  untracked: string[];
  modified: string[];
}

export interface ToolInfo {
  name: string;
  description: string;
  isReadOnly: boolean;
  group: string;
  inputSchema: Record<string, unknown>;
}

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
  triggers: string[];
  allowedTools: string[];
}

export interface ShortTermMemory {
  content: string;
  timestamp: number;
  source: string;
}

export interface LongTermMemory {
  content: string;
  lastUpdated: number;
  topics: string[];
}

export interface ProceduralMemory {
  skill: string;
  steps: string[];
  lastUsed: number;
  successRate: number;
}

export interface TaskDrivenContext {
  currentTask: string;
  explorationGoals: string[];
  completedSteps: ExplorationStep[];
  observations: Observation[];
  nextActions: string[];
}

export interface ExplorationStep {
  step: number;
  action: string;
  tool: string;
  input: string;
  output: string;
  timestamp: number;
}

export interface Observation {
  type: "file" | "command" | "search" | "browser" | "api";
  content: string;
  relevance: number;
  timestamp: number;
}

export interface LayeredMemory {
  l1PromptMemory: PromptMemory;
  l2SessionSearch: SessionSearch;
  l3ProceduralMemory: ProceduralMemoryLayer;
  l4ExternalMemory: ExternalMemory;
}

export interface PromptMemory {
  content: string;
  tokenCount: number;
  lastLoaded: number;
}

export interface SessionSearch {
  query: string;
  results: SessionResult[];
}

export interface SessionResult {
  sessionId: string;
  content: string;
  relevance: number;
  timestamp: number;
}

export interface ProceduralMemoryLayer {
  summary: string;
  fullContent?: string;
  loaded: boolean;
}

export interface ExternalMemory {
  backend: string;
  connected: boolean;
  lastSync: number;
}

export interface BootstrapFile {
  name: string;
  path: string;
  content: string;
  truncated: boolean;
  injected: boolean;
}

export interface ExplorationEngineConfig {
  maxBootstrapChars: number;
  maxTotalBootstrapChars: number;
  maxDirectoryDepth: number;
  maxTopLevelEntries: number;
  maxDependencies: number;
  maxShortTermMemories: number;
  cacheTtlMs: number;
  enableGitExploration: boolean;
  enableProjectExploration: boolean;
  enableMemoryExploration: boolean;
  securityPolicy?: Partial<SecurityPolicy>;
  maxEnvTokens: number;
  enableDynamicRefresh: boolean;
  changeDetectionIntervalMs: number;
}

const DEFAULT_CONFIG: ExplorationEngineConfig = {
  maxBootstrapChars: 20000,
  maxTotalBootstrapChars: 150000,
  maxDirectoryDepth: 3,
  maxTopLevelEntries: 15,
  maxDependencies: 20,
  maxShortTermMemories: 10,
  cacheTtlMs: 60_000,
  enableGitExploration: true,
  enableProjectExploration: true,
  enableMemoryExploration: true,
  maxEnvTokens: 800,
  enableDynamicRefresh: true,
  changeDetectionIntervalMs: 30_000,
};

const BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "TOOLS.md", "MEMORY.md", "IDENTITY.md", "HEARTBEAT.md"];

export class ExplorationEngine {
  private config: ExplorationEngineConfig;
  private workspaceRoot: string;
  private cache: Map<string, { value: unknown; expiry: number }>;
  private context: ExplorationContext | null;
  private security: ExplorationSecurity;
  private desensitizer: ExplorationDesensitizer;
  private lastEnvironmentSnapshot: string;
  private lastEnvironmentTimestamp: number;
  private changeDetectionTimer: ReturnType<typeof setInterval> | null;

  constructor(workspaceRoot: string, config?: Partial<ExplorationEngineConfig>) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.context = null;
    this.security = createExplorationSecurity(workspaceRoot, this.config.securityPolicy);
    this.desensitizer = createExplorationDesensitizer();
    this.lastEnvironmentSnapshot = "";
    this.lastEnvironmentTimestamp = 0;
    this.changeDetectionTimer = null;
  }

  async initialize(): Promise<ExplorationContext> {
    const baseline = await this.loadBaselineContext();
    const layeredMemory = await this.loadLayeredMemory();

    this.context = {
      baseline,
      taskDriven: {
        currentTask: "",
        explorationGoals: [],
        completedSteps: [],
        observations: [],
        nextActions: [],
      },
      layeredMemory,
      explorationHistory: [],
    };

    if (this.config.enableDynamicRefresh) {
      this.startChangeDetection();
    }

    return this.context;
  }

  startChangeDetection(): void {
    if (this.changeDetectionTimer) {
      clearInterval(this.changeDetectionTimer);
    }

    this.changeDetectionTimer = setInterval(async () => {
      await this.detectAndRefreshChanges();
    }, this.config.changeDetectionIntervalMs);
  }

  stopChangeDetection(): void {
    if (this.changeDetectionTimer) {
      clearInterval(this.changeDetectionTimer);
      this.changeDetectionTimer = null;
    }
  }

  async detectAndRefreshChanges(): Promise<boolean> {
    if (!this.context) return false;

    const currentSnapshot = await this.generateEnvironmentSnapshot();
    const hasChanged = currentSnapshot !== this.lastEnvironmentSnapshot;

    if (hasChanged) {
      this.lastEnvironmentSnapshot = currentSnapshot;
      this.lastEnvironmentTimestamp = Date.now();

      const gitState = await this.loadGitState();
      this.context.baseline.workspace.gitState = gitState;
      this.context.baseline.time = this.loadTimeInfo();
    }

    return hasChanged;
  }

  async generateEnvironmentSnapshot(): Promise<string> {
    const gitState = await this.loadGitState();
    return JSON.stringify({
      git: gitState,
      time: this.loadTimeInfo(),
    });
  }

  async loadBaselineContext(): Promise<BaselineContext> {
    const [identity, user, workspace, runtime, tools, skills, memory, time] = await Promise.all([
      this.loadIdentity(),
      this.loadUserInfo(),
      this.loadWorkspaceBaseline(),
      this.loadRuntimeBaseline(),
      this.loadToolRegistry(),
      this.loadSkillRegistry(),
      this.loadMemoryBaseline(),
      this.loadTimeInfo(),
    ]);

    return { identity, user, workspace, runtime, tools, skills, memory, time };
  }

  async loadBootstrapFiles(): Promise<BootstrapFile[]> {
    const files: BootstrapFile[] = [];
    let totalChars = 0;

    for (const name of BOOTSTRAP_FILES) {
      const path = join(this.workspaceRoot, name);

      if (!existsSync(path)) {
        files.push({ name, path, content: "", truncated: false, injected: false });
        continue;
      }

      let content = await readFile(path, "utf-8");
      let truncated = false;

      if (content.length > this.config.maxBootstrapChars) {
        const keepStart = Math.floor(this.config.maxBootstrapChars * 0.7);
        const keepEnd = Math.floor(this.config.maxBootstrapChars * 0.2);
        content = content.slice(0, keepStart) + "\n\n... [中间内容已截断] ...\n\n" + content.slice(-keepEnd);
        truncated = true;
      }

      if (totalChars + content.length > this.config.maxTotalBootstrapChars) {
        break;
      }

      totalChars += content.length;
      files.push({ name, path, content, truncated, injected: true });
    }

    return files;
  }

  async loadIdentity(): Promise<IdentityInfo> {
    const identityPath = join(this.workspaceRoot, "IDENTITY.md");
    const soulPath = join(this.workspaceRoot, "SOUL.md");

    let name = "OpenFlow Agent";
    let role = "AI coding assistant";
    let personality = "";
    const constraints: string[] = [];

    try {
      if (existsSync(identityPath)) {
        const content = await readFile(identityPath, "utf-8");
        const nameMatch = content.match(/name:\s*(.+)/i);
        const roleMatch = content.match(/role:\s*(.+)/i);
        if (nameMatch) name = nameMatch[1].trim();
        if (roleMatch) role = roleMatch[1].trim();
      }
    } catch {
      // Use defaults
    }

    try {
      if (existsSync(soulPath)) {
        const content = await readFile(soulPath, "utf-8");
        personality = content.slice(0, 500);
        const constraintMatches = content.matchAll(/[-*]\s*(?:不要|禁止|必须|应该|不能)\s*(.+)/g);
        for (const match of constraintMatches) {
          constraints.push(match[1].trim());
        }
      }
    } catch {
      // Use defaults
    }

    return { name, role, personality, constraints };
  }

  async loadUserInfo(): Promise<UserInfo> {
    const userPath = join(this.workspaceRoot, "USER.md");

    if (!existsSync(userPath)) {
      return {
        name: process.env.USER || "user",
        preferences: [],
        technicalLevel: "unknown",
        communicationStyle: "default",
      };
    }

    try {
      const content = await readFile(userPath, "utf-8");
      const nameMatch = content.match(/name:\s*(.+)/i);
      const preferences: string[] = [];
      const prefMatches = content.matchAll(/[-*]\s*(?:偏好|喜欢|习惯)\s*(.+)/g);
      for (const match of prefMatches) {
        preferences.push(match[1].trim());
      }

      return {
        name: nameMatch?.[1].trim() || process.env.USER || "user",
        preferences,
        technicalLevel: this.detectTechnicalLevel(content),
        communicationStyle: this.detectCommunicationStyle(content),
      };
    } catch {
      return {
        name: process.env.USER || "user",
        preferences: [],
        technicalLevel: "unknown",
        communicationStyle: "default",
      };
    }
  }

  async loadWorkspaceBaseline(): Promise<WorkspaceBaseline> {
    const structure = await this.scanDirectory(this.workspaceRoot, 0);
    const projectType = await this.detectProjectType();
    const conventions = await this.detectConventions();
    const configFiles = await this.loadConfigFiles();
    const gitState = await this.loadGitState();

    return {
      rootPath: this.workspaceRoot,
      structure,
      projectType,
      conventions,
      configFiles,
      gitState,
    };
  }

  async loadRuntimeBaseline(): Promise<RuntimeBaseline> {
    const os = await this.loadOSInfo();
    let nodeVersion = process.version;
    let npmVersion = "unknown";

    try {
      const { stdout } = await execAsync("npm --version");
      npmVersion = stdout.trim();
    } catch {
      // Use default
    }

    const env: Record<string, string> = {};
    const importantEnvVars = ["EDITOR", "VISUAL", "TERM", "LANG", "PATH", "HOME", "USER"];
    for (const key of importantEnvVars) {
      if (process.env[key]) {
        env[key] = process.env[key]!;
      }
    }

    return {
      os,
      nodeVersion,
      npmVersion,
      shell: process.env.SHELL || "unknown",
      env,
      sandbox: {
        enabled: false,
        mode: "non-main",
        allowedPaths: [this.workspaceRoot],
        elevatedExec: false,
      },
    };
  }

  async loadToolRegistry(): Promise<ToolRegistry> {
    return {
      available: [],
      groups: {},
      profiles: {},
    };
  }

  async loadSkillRegistry(): Promise<SkillRegistry> {
    const skillsDir = join(this.workspaceRoot, ".openflow", "skills");
    const available: SkillInfo[] = [];

    if (existsSync(skillsDir)) {
      try {
        const entries = await readdir(skillsDir);
        for (const entry of entries) {
          if (entry.endsWith(".md") || entry.endsWith(".skill.md")) {
            const content = await readFile(join(skillsDir, entry), "utf-8");
            const nameMatch = content.match(/name:\s*(.+)/i);
            const descMatch = content.match(/description:\s*(.+)/i);
            available.push({
              name: nameMatch?.[1].trim() || entry,
              description: descMatch?.[1].trim() || "",
              location: join(skillsDir, entry),
              triggers: [],
              allowedTools: [],
            });
          }
        }
      } catch {
        // Directory not accessible
      }
    }

    return { available, loaded: [] };
  }

  async loadMemoryBaseline(): Promise<MemoryBaseline> {
    const shortTerm: ShortTermMemory[] = [];
    const longTerm: LongTermMemory = { content: "", lastUpdated: 0, topics: [] };
    const procedural: ProceduralMemory[] = [];

    if (this.config.enableMemoryExploration) {
      const memoryPath = join(this.workspaceRoot, "MEMORY.md");
      if (existsSync(memoryPath)) {
        try {
          const content = await readFile(memoryPath, "utf-8");
          longTerm.content = content.slice(0, this.config.maxBootstrapChars);
          longTerm.lastUpdated = (await stat(memoryPath)).mtimeMs;
          const topicMatches = content.matchAll(/##\s*(.+)/g);
          for (const match of topicMatches) {
            longTerm.topics.push(match[1].trim());
          }
        } catch {
          // File not accessible
        }
      }

      const sessionsDir = join(this.workspaceRoot, ".openflow", "memory", "sessions");
      if (existsSync(sessionsDir)) {
        try {
          const entries = await readdir(sessionsDir);
          const recent = entries
            .filter((e) => e.endsWith(".json"))
            .sort()
            .reverse()
            .slice(0, this.config.maxShortTermMemories);

          for (const entry of recent) {
            const content = await readFile(join(sessionsDir, entry), "utf-8");
            shortTerm.push({
              content: content.slice(0, 500),
              timestamp: Date.now(),
              source: entry,
            });
          }
        } catch {
          // Directory not accessible
        }
      }
    }

    return { shortTerm, longTerm, procedural };
  }

  loadTimeInfo(): TimeInfo {
    return {
      iso: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      unixTimestamp: Date.now(),
    };
  }

  async loadLayeredMemory(): Promise<LayeredMemory> {
    const l1Content = await this.loadBootstrapFiles();
    const l1Chars = l1Content.filter((f) => f.injected).reduce((sum, f) => sum + f.content.length, 0);

    return {
      l1PromptMemory: {
        content: l1Content.filter((f) => f.injected).map((f) => `## ${f.name}\n${f.content}`).join("\n\n"),
        tokenCount: Math.floor(l1Chars / 4),
        lastLoaded: Date.now(),
      },
      l2SessionSearch: {
        query: "",
        results: [],
      },
      l3ProceduralMemory: {
        summary: "",
        loaded: false,
      },
      l4ExternalMemory: {
        backend: "none",
        connected: false,
        lastSync: 0,
      },
    };
  }

  async startTaskDrivenExploration(task: string, goals: string[]): Promise<void> {
    if (!this.context) {
      await this.initialize();
    }

    this.context!.taskDriven.currentTask = task;
    this.context!.taskDriven.explorationGoals = goals;
    this.context!.taskDriven.nextActions = this.planExplorationSteps(task, goals);
  }

  async recordExplorationStep(step: ExplorationStep): Promise<void> {
    if (!this.context) return;

    this.context.explorationHistory.push(step);
    this.context.taskDriven.completedSteps.push(step);
    this.context.taskDriven.observations.push({
      type: this.inferObservationType(step.tool),
      content: step.output,
      relevance: this.estimateRelevance(step.output, this.context.taskDriven.currentTask),
      timestamp: step.timestamp,
    });

    this.context.taskDriven.nextActions = this.updateNextActions(step);
  }

  async consolidateExperience(): Promise<void> {
    if (!this.context) return;

    const memoryPath = join(this.workspaceRoot, "MEMORY.md");
    let existingContent = "";

    if (existsSync(memoryPath)) {
      existingContent = await readFile(memoryPath, "utf-8");
    }

    const newSection = this.generateExperienceSection();
    const updatedContent = existingContent + "\n\n" + newSection;

    await writeFile(memoryPath, updatedContent, "utf-8");
  }

  formatForIntentRecognition(maxTokens?: number): DesensitizationResult {
    if (!this.context) {
      return { content: "", stats: { totalRulesApplied: 0, sensitiveItemsFound: 0, originalLength: 0, desensitizedLength: 0, processingTimeMs: 0 } };
    }

    const tokenLimit = maxTokens || this.config.maxEnvTokens;
    const lines: string[] = [];
    let currentTokens = 0;

    const sections: { name: string; content: string; priority: number }[] = [];

    sections.push({
      name: "身份与约束",
      content: this.formatIdentitySection(),
      priority: 10,
    });

    sections.push({
      name: "用户信息",
      content: this.formatUserSection(),
      priority: 9,
    });

    sections.push({
      name: "运行时环境",
      content: this.formatRuntimeSection(),
      priority: 8,
    });

    sections.push({
      name: "项目信息",
      content: this.formatProjectSection(),
      priority: 7,
    });

    sections.push({
      name: "工作区结构",
      content: this.formatWorkspaceSection(),
      priority: 5,
    });

    sections.push({
      name: "引导文件",
      content: this.formatBootstrapSection(),
      priority: 6,
    });

    sections.push({
      name: "长期记忆",
      content: this.formatLongTermMemorySection(),
      priority: 4,
    });

    sections.push({
      name: "时间",
      content: this.formatTimeSection(),
      priority: 3,
    });

    sections.sort((a, b) => b.priority - a.priority);

    for (const section of sections) {
      const sectionTokens = this.estimateTokens(section.content);
      if (currentTokens + sectionTokens > tokenLimit) {
        const remainingTokens = tokenLimit - currentTokens;
        if (remainingTokens > 50) {
          const truncated = this.truncateToTokens(section.content, remainingTokens);
          lines.push(`## ${section.name}`);
          lines.push(truncated);
        }
        break;
      }

      lines.push(`## ${section.name}`);
      lines.push(section.content);
      currentTokens += sectionTokens;
    }

    const rawContent = lines.join("\n");
    return this.desensitizer.desensitize(rawContent);
  }

  private formatIdentitySection(): string {
    const lines: string[] = [];
    lines.push(`- 名称: ${this.context!.baseline.identity.name}`);
    lines.push(`- 角色: ${this.context!.baseline.identity.role}`);
    if (this.context!.baseline.identity.constraints.length > 0) {
      lines.push(`- 约束: ${this.context!.baseline.identity.constraints.slice(0, 3).join("; ")}`);
    }
    return lines.join("\n");
  }

  private formatUserSection(): string {
    const lines: string[] = [];
    lines.push(`- 名称: ${this.context!.baseline.user.name}`);
    lines.push(`- 技术水平: ${this.context!.baseline.user.technicalLevel}`);
    lines.push(`- 沟通风格: ${this.context!.baseline.user.communicationStyle}`);
    return lines.join("\n");
  }

  private formatRuntimeSection(): string {
    const lines: string[] = [];
    lines.push(`- OS: ${this.context!.baseline.runtime.os.platform} ${this.context!.baseline.runtime.os.release}`);
    lines.push(`- Node.js: ${this.context!.baseline.runtime.nodeVersion}`);
    lines.push(`- Shell: ${this.context!.baseline.runtime.shell}`);
    return lines.join("\n");
  }

  private formatProjectSection(): string {
    const lines: string[] = [];
    lines.push(`- 类型: ${this.context!.baseline.workspace.projectType}`);
    if (this.context!.baseline.workspace.gitState.branch) {
      lines.push(`- Git 分支: ${this.context!.baseline.workspace.gitState.branch}`);
    }
    if (this.context!.baseline.workspace.conventions.length > 0) {
      lines.push(`- 规范: ${this.context!.baseline.workspace.conventions.slice(0, 2).join("; ")}`);
    }
    return lines.join("\n");
  }

  private formatWorkspaceSection(): string {
    return this.formatDirectoryTree(this.context!.baseline.workspace.structure, 0);
  }

  private formatBootstrapSection(): string {
    if (!this.context!.layeredMemory.l1PromptMemory.content) return "";
    return this.context!.layeredMemory.l1PromptMemory.content.slice(0, 1000);
  }

  private formatLongTermMemorySection(): string {
    if (!this.context!.baseline.memory.longTerm.content) return "";
    return this.context!.baseline.memory.longTerm.content.slice(0, 500);
  }

  private formatTimeSection(): string {
    const lines: string[] = [];
    lines.push(`- 当前时间: ${this.context!.baseline.time.iso}`);
    lines.push(`- 时区: ${this.context!.baseline.time.timezone}`);
    return lines.join("\n");
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private truncateToTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + "\n... [已截断]";
  }

  private async scanDirectory(dirPath: string, depth: number): Promise<DirectoryTree> {
    const name = basename(dirPath);
    const tree: DirectoryTree = { name, type: "directory", children: [] };

    const depthValidation = this.security.validateDirectoryDepth(depth);
    if (!depthValidation.allowed) {
      return tree;
    }

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      const entryValidation = this.security.validateEntryCount(entries.length);
      if (!entryValidation.allowed) {
        return tree;
      }

      const filtered = entries
        .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== ".git")
        .slice(0, this.config.maxTopLevelEntries);

      for (const entry of filtered) {
        const fullPath = join(dirPath, entry.name);
        
        const pathValidation = await this.security.validatePath(fullPath);
        if (!pathValidation.allowed) {
          continue;
        }

        const entryStat = await stat(fullPath);

        if (entry.isDirectory()) {
          const child = await this.scanDirectory(fullPath, depth + 1);
          tree.children!.push(child);
        } else {
          tree.children!.push({
            name: entry.name,
            type: "file",
            size: entryStat.size,
            modifiedAt: entryStat.mtime.toISOString(),
          });
        }
      }
    } catch {
      // Directory not accessible
    }

    return tree;
  }

  private async detectProjectType(): Promise<string> {
    const indicators: Record<string, string> = {
      "package.json": "node",
      "pyproject.toml": "python",
      "Cargo.toml": "rust",
      "go.mod": "go",
      "pom.xml": "java-maven",
      "build.gradle": "java-gradle",
      "CMakeLists.txt": "cpp-cmake",
      "Makefile": "make",
      "requirements.txt": "python",
      "Gemfile": "ruby",
      "composer.json": "php",
    };

    for (const [file, type] of Object.entries(indicators)) {
      if (existsSync(join(this.workspaceRoot, file))) {
        return type;
      }
    }

    return "unknown";
  }

  private async detectConventions(): Promise<string[]> {
    const conventions: string[] = [];

    const eslintPath = join(this.workspaceRoot, ".eslintrc", ".eslintrc.js", ".eslintrc.json");
    if (existsSync(join(this.workspaceRoot, ".eslintrc.js")) || existsSync(join(this.workspaceRoot, ".eslintrc.json"))) {
      conventions.push("使用 ESLint 进行代码检查");
    }

    if (existsSync(join(this.workspaceRoot, ".prettierrc"))) {
      conventions.push("使用 Prettier 进行代码格式化");
    }

    if (existsSync(join(this.workspaceRoot, "tsconfig.json"))) {
      conventions.push("使用 TypeScript");
    }

    return conventions;
  }

  private async loadConfigFiles(): Promise<ConfigFile[]> {
    const configNames = [
      "package.json", "tsconfig.json", "pyproject.toml", "requirements.txt",
      "Cargo.toml", "go.mod", "Makefile", "Dockerfile",
    ];

    const files: ConfigFile[] = [];

    for (const name of configNames) {
      const path = join(this.workspaceRoot, name);
      if (existsSync(path)) {
        try {
          let content = await readFile(path, "utf-8");
          let truncated = false;

          if (content.length > this.config.maxBootstrapChars) {
            content = content.slice(0, this.config.maxBootstrapChars);
            truncated = true;
          }

          files.push({ name, path, content, truncated });
        } catch {
          // File not readable
        }
      }
    }

    return files;
  }

  private async loadGitState(): Promise<GitState> {
    const gitPath = join(this.workspaceRoot, ".git");
    if (!existsSync(gitPath) || !this.config.enableGitExploration) {
      return { branch: "", status: "", lastCommit: "", remote: "", untracked: [], modified: [] };
    }

    try {
      const [branch, status, lastCommit, remote] = await Promise.all([
        this.execGit("branch --show-current"),
        this.execGit("status --short"),
        this.execGit("log -1 --format='%h %s (%cr)'"),
        this.execGit("remote get-url origin"),
      ]);

      const untracked: string[] = [];
      const modified: string[] = [];
      for (const line of status.split("\n")) {
        if (line.startsWith("??")) untracked.push(line.slice(2).trim());
        if (line.startsWith(" M") || line.startsWith("M ")) modified.push(line.slice(2).trim());
      }

      return {
        branch: branch.trim(),
        status: status.trim(),
        lastCommit: lastCommit.trim(),
        remote: remote.trim(),
        untracked,
        modified,
      };
    } catch {
      return { branch: "", status: "", lastCommit: "", remote: "", untracked: [], modified: [] };
    }
  }

  private async loadOSInfo(): Promise<OSInfo> {
    let release = "";
    try {
      const { stdout } = await execAsync("uname -r");
      release = stdout.trim();
    } catch {
      release = "unknown";
    }

    let cpuCount = 0;
    let totalMemory = 0;
    try {
      cpuCount = require("node:os").cpus().length;
      totalMemory = require("node:os").totalmem();
    } catch {
      cpuCount = 1;
      totalMemory = 0;
    }

    return {
      platform: process.platform,
      release,
      arch: process.arch,
      hostname: process.env.HOSTNAME || "unknown",
      cpuCount,
      totalMemory,
    };
  }

  private detectTechnicalLevel(content: string): string {
    const keywords = ["架构", "设计模式", "微服务", "分布式", "性能优化", "CI/CD"];
    let score = 0;
    for (const keyword of keywords) {
      if (content.includes(keyword)) score++;
    }
    return score > 2 ? "advanced" : score > 0 ? "intermediate" : "beginner";
  }

  private detectCommunicationStyle(content: string): string {
    if (content.includes("简洁") || content.includes("简短")) return "concise";
    if (content.includes("详细") || content.includes("完整")) return "detailed";
    if (content.includes("代码") || content.includes("示例")) return "code-focused";
    return "default";
  }

  private planExplorationSteps(task: string, goals: string[]): string[] {
    const steps: string[] = [];

    if (task.includes("代码") || task.includes("开发")) {
      steps.push("读取项目结构和配置文件");
      steps.push("检查依赖和构建脚本");
      steps.push("查看相关源代码文件");
    }

    if (task.includes("调试") || task.includes("错误")) {
      steps.push("查看错误日志");
      steps.push("检查相关配置文件");
      steps.push("搜索类似问题解决方案");
    }

    if (task.includes("部署") || task.includes("发布")) {
      steps.push("检查部署配置");
      steps.push("验证构建脚本");
      steps.push("检查环境变量和凭证");
    }

    return steps;
  }

  private inferObservationType(tool: string): Observation["type"] {
    if (tool.includes("read") || tool.includes("file")) return "file";
    if (tool.includes("bash") || tool.includes("exec")) return "command";
    if (tool.includes("search") || tool.includes("web")) return "search";
    if (tool.includes("browser")) return "browser";
    return "file";
  }

  private estimateRelevance(output: string, task: string): number {
    if (!task) return 0.5;

    const taskWords = task.split(/\s+/);
    let matchCount = 0;

    for (const word of taskWords) {
      if (word.length > 2 && output.includes(word)) {
        matchCount++;
      }
    }

    return Math.min(1.0, matchCount / taskWords.length);
  }

  private updateNextActions(lastStep: ExplorationStep): string[] {
    if (!this.context) return [];

    const remaining = this.context.taskDriven.explorationGoals.filter(
      (g) => !this.context!.taskDriven.completedSteps.some((s) => s.action.includes(g))
    );

    return remaining.slice(0, 3);
  }

  private generateExperienceSection(): string {
    if (!this.context) return "";

    const lines: string[] = [];
    lines.push(`## 任务经验 - ${new Date().toISOString()}`);
    lines.push(`### 任务: ${this.context.taskDriven.currentTask}`);
    lines.push("");
    lines.push("#### 执行步骤");
    for (const step of this.context.taskDriven.completedSteps) {
      lines.push(`${step.step}. ${step.action} (使用 ${step.tool})`);
    }
    lines.push("");
    lines.push("#### 观察与发现");
    for (const obs of this.context.taskDriven.observations) {
      lines.push(`- [${obs.type}] ${obs.content.slice(0, 100)}... (相关度: ${obs.relevance})`);
    }
    lines.push("");
    lines.push("#### 经验总结");
    lines.push("- 待补充");
    lines.push("");

    return lines.join("\n");
  }

  private formatDirectoryTree(tree: DirectoryTree, depth: number): string {
    const indent = "  ".repeat(depth);
    let result = `${indent}${tree.type === "directory" ? "📁" : "📄"} ${tree.name}`;

    if (tree.children && tree.children.length > 0) {
      result += "\n";
      for (const child of tree.children) {
        result += this.formatDirectoryTree(child, depth + 1) + "\n";
      }
    }

    return result;
  }

  private async execGit(args: string): Promise<string> {
    const command = `git -C "${this.workspaceRoot}" ${args}`;
    const validation = this.security.validateCommand(command);
    if (!validation.allowed) {
      throw new Error(`Git 命令被安全策略阻止: ${validation.violations.map((v) => v.message).join("; ")}`);
    }
    const { stdout } = await execAsync(command);
    return stdout;
  }

  getSecurity(): ExplorationSecurity {
    return this.security;
  }

  getEnvironmentAge(): number {
    return Date.now() - this.lastEnvironmentTimestamp;
  }

  hasEnvironmentChanged(): boolean {
    return this.lastEnvironmentTimestamp > 0;
  }
}

export function createExplorationEngine(workspaceRoot: string, config?: Partial<ExplorationEngineConfig>): ExplorationEngine {
  return new ExplorationEngine(workspaceRoot, config);
}
