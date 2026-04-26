import { readFile, access, stat, watch } from "node:fs/promises";
import { join, resolve, extname, dirname, relative } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { WorkflowEngine, WorkflowDefinition, WorkflowResult, WorkflowMode, WorkflowStep, WorkflowStepType } from "./workflow-engine.js";
import { z } from "zod";

const execAsync = promisify(exec);

export enum AssetType {
  MARKDOWN = "markdown",
  JAVASCRIPT = "javascript",
  PYTHON = "python",
  SHELL = "shell",
  HTML = "html",
  JSON = "json",
  YAML = "yaml",
  LATEX = "latex",
  BIBTEX = "bibtex",
  XML = "xml",
  PDF = "pdf",
  AUDIO = "audio",
  TEXT = "text",
  MAKEFILE = "makefile",
  UNKNOWN = "unknown",
}

export const AssetTypeSchema = z.nativeEnum(AssetType);

export const AssetFileSchema: z.ZodType<any> = z.object({
  path: z.string(),
  name: z.string(),
  type: AssetTypeSchema,
  content: z.string().optional(),
  executable: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  workflow: z.object({
    mode: z.enum(["sequential", "parallel", "dag"]).optional(),
    steps: z.array(z.any()).optional(),
  }).optional(),
});

export type AssetFile = z.infer<typeof AssetFileSchema>;

export const SkillFrontMatterSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  license: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  prerequisites: z.object({
    env_vars: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
  }).optional(),
  compatibility: z.object({
    nodejs: z.string().optional(),
    python: z.string().optional(),
  }).optional(),
  "disable-model-invocation": z.boolean().optional(),
  "user-invocable": z.boolean().optional(),
  "allowed-tools": z.array(z.string()).optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  context: z.literal("fork").optional(),
  agent: z.string().optional(),
  arguments: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
  shell: z.enum(["bash", "powershell"]).optional(),
  requires_tools: z.array(z.string()).optional(),
  requires_toolsets: z.array(z.string()).optional(),
  fallback_for_tools: z.array(z.string()).optional(),
  fallback_for_toolsets: z.array(z.string()).optional(),
  hooks: z.record(z.string(), z.string()).optional(),
  setup: z.object({
    help: z.string().optional(),
    collect_secrets: z.array(z.object({
      env_var: z.string(),
      prompt: z.string(),
      secret: z.boolean(),
    })).optional(),
  }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SkillFrontMatter = z.infer<typeof SkillFrontMatterSchema>;

export interface SkillPackage {
  name: string;
  description: string;
  qualifiedName: string;
  frontMatter: SkillFrontMatter;
  skillMd: AssetFile;
  scripts: AssetFile[];
  references: AssetFile[];
  templates: AssetFile[];
  assets: AssetFile[];
  source: string;
  isActive: boolean;
}

export const CommandFrontMatterSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  "allowed-tools": z.array(z.string()).optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  context: z.literal("fork").optional(),
  agent: z.string().optional(),
  arguments: z.array(z.string()).optional(),
});

export type CommandFrontMatter = z.infer<typeof CommandFrontMatterSchema>;

export interface CommandPackage {
  name: string;
  description: string;
  template: string;
  frontMatter: CommandFrontMatter;
  scripts: AssetFile[];
  source: string;
}

export const AgentFrontMatterSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  "max-steps": z.number().optional(),
  temperature: z.number().optional(),
});

export type AgentFrontMatter = z.infer<typeof AgentFrontMatterSchema>;

export interface AgentPackage {
  name: string;
  description: string;
  systemPrompt: string;
  frontMatter: AgentFrontMatter;
  source: string;
}

export enum SecurityLevel {
  SAFE = "safe",
  RESTRICTED = "restricted",
  DANGEROUS = "dangerous",
  BLOCKED = "blocked",
}

export const SecurityLevelSchema = z.nativeEnum(SecurityLevel);

export const SecurityPolicySchema = z.object({
  allowedFileTypes: z.array(AssetTypeSchema),
  allowedCommands: z.array(z.string()),
  blockedCommands: z.array(z.string()),
  maxExecutionTime: z.number(),
  maxMemoryMB: z.number(),
  allowNetworkAccess: z.boolean(),
  allowFileSystemWrite: z.boolean(),
  allowedWritePaths: z.array(z.string()),
  requireUserConfirmation: z.array(AssetTypeSchema),
  disableSkillShellExecution: z.boolean(),
});

export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;

const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  allowedFileTypes: [
    AssetType.MARKDOWN,
    AssetType.JAVASCRIPT,
    AssetType.PYTHON,
    AssetType.SHELL,
    AssetType.HTML,
    AssetType.JSON,
    AssetType.YAML,
    AssetType.LATEX,
    AssetType.BIBTEX,
    AssetType.XML,
    AssetType.TEXT,
  ],
  allowedCommands: [
    "node",
    "python3",
    "python",
    "bash",
    "sh",
    "npx",
    "pip3",
    "latexmk",
    "pdflatex",
    "xelatex",
    "bibtex",
    "make",
    "git",
    "grep",
    "find",
    "ls",
    "cat",
    "head",
    "tail",
    "wc",
    "sort",
    "uniq",
    "cut",
    "sed",
    "awk",
    "jq",
    "tree",
  ],
  blockedCommands: [
    "rm -rf",
    "rm -f",
    "sudo",
    "chmod 777",
    "curl",
    "wget",
    "nc ",
    "netcat",
    "ssh ",
    "scp ",
    "dd ",
    "mkfs",
    "fdisk",
    "shutdown",
    "reboot",
    "kill ",
    "pkill",
    "killall",
    "iptables",
    "ufw",
    "firewall",
  ],
  maxExecutionTime: 60000,
  maxMemoryMB: 512,
  allowNetworkAccess: false,
  allowFileSystemWrite: false,
  allowedWritePaths: [],
  requireUserConfirmation: [
    AssetType.SHELL,
    AssetType.PYTHON,
  ],
  disableSkillShellExecution: false,
};

export class UnifiedEngine extends EventEmitter {
  private workspaceRoot: string;
  private sandbox: boolean;
  private securityPolicy: SecurityPolicy;
  private skills: Map<string, SkillPackage> = new Map();
  private commands: Map<string, CommandPackage> = new Map();
  private agents: Map<string, AgentPackage> = new Map();
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executionLog: ExecutionRecord[] = [];
  private watchers: Map<string, ReturnType<typeof watch>> = new Map();
  private availableTools: Set<string> = new Set();
  private availableToolSets: Set<string> = new Set();
  private pluginSkills: Map<string, SkillPackage> = new Map();
  private workflowEngine: WorkflowEngine;

  constructor(workspaceRoot: string, sandbox = true, securityPolicy?: Partial<SecurityPolicy>) {
    super();
    this.workspaceRoot = resolve(workspaceRoot);
    this.sandbox = sandbox;
    this.securityPolicy = { ...DEFAULT_SECURITY_POLICY, ...securityPolicy };
    this.workflowEngine = new WorkflowEngine();
  }

  async initialize(): Promise<void> {
    await this.discoverSkills();
    await this.discoverCommands();
    await this.discoverAgents();
    await this.discoverWorkflows();
    this.setupWatchers();
    this.setupWorkflowListeners();
  }

  async discoverSkills(): Promise<void> {
    const skillDirs = await this.findSkillDirectories();

    for (const dir of skillDirs) {
      try {
        const skill = await this.loadSkillPackage(dir);
        if (this.isSkillActive(skill)) {
          this.skills.set(skill.qualifiedName, skill);
          this.emit("skill:loaded", skill);
        }
      } catch (error) {
        this.emit("skill:error", { dir, error });
      }
    }
  }

  async discoverCommands(): Promise<void> {
    const commandDirs = await this.findCommandDirectories();

    for (const dir of commandDirs) {
      try {
        const command = await this.loadCommandPackage(dir);
        this.commands.set(command.name, command);
        this.emit("command:loaded", command);
      } catch (error) {
        this.emit("command:error", { dir, error });
      }
    }
  }

  async discoverAgents(): Promise<void> {
    const agentFiles = await this.findAgentFiles();

    for (const file of agentFiles) {
      try {
        const agent = await this.loadAgentFile(file);
        this.agents.set(agent.name, agent);
        this.emit("agent:loaded", agent);
      } catch (error) {
        this.emit("agent:error", { file, error });
      }
    }
  }

  async discoverWorkflows(): Promise<void> {
    const workflowFiles = await this.findWorkflowFiles();

    for (const file of workflowFiles) {
      try {
        const content = await readFile(file, "utf-8");
        const workflow = this.parseWorkflowFile(content, file);
        this.workflows.set(workflow.name, workflow);
        this.emit("workflow:loaded", workflow);
      } catch (error) {
        this.emit("workflow:error", { file, error });
      }
    }

    for (const [skillName, skill] of this.skills) {
      const fm = skill.frontMatter as Record<string, unknown>;
      if (fm.workflow) {
        const workflow = this.extractWorkflowFromSkill(skill);
        this.workflows.set(`${skillName}:workflow`, workflow);
        this.emit("workflow:loaded", workflow);
      }
    }
  }

  setupWorkflowListeners(): void {
    this.workflowEngine.on("step:prompt", (data) => {
      this.emit("workflow:step:prompt", data);
    });

    this.workflowEngine.on("step:script", (data) => {
      this.emit("workflow:step:script", data);
    });

    this.workflowEngine.on("step:agent", (data) => {
      this.emit("workflow:step:agent", data);
    });

    this.workflowEngine.on("step:complete", (data) => {
      this.emit("workflow:step:complete", data);
    });

    this.workflowEngine.on("step:error", (data) => {
      this.emit("workflow:step:error", data);
    });
  }

  async executeWorkflow(workflowName: string, context?: Record<string, unknown>): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    return this.workflowEngine.executeWorkflow(workflow, context);
  }

  getWorkflowListing(): Array<{ name: string; description: string; mode: string; steps: number }> {
    const result: Array<{ name: string; description: string; mode: string; steps: number }> = [];

    for (const [name, workflow] of this.workflows) {
      result.push({
        name,
        description: workflow.description,
        mode: workflow.mode,
        steps: workflow.steps.length,
      });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  generateWorkflowMarkdown(workflowName: string): string {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    let markdown = `# ${workflow.name}\n\n`;
    markdown += `${workflow.description}\n\n`;
    markdown += `**Mode**: ${workflow.mode}\n`;
    markdown += `**Steps**: ${workflow.steps.length}\n\n`;

    markdown += `## Workflow Diagram\n\n`;
    markdown += "```\n";

    for (const step of workflow.steps) {
      const needs = step.needs?.length ? ` [needs: ${step.needs.join(", ")}]` : "";
      const icon = this.getStepIcon(step.type);
      markdown += `${icon} ${step.id}${needs}\n`;

      if (step.needs) {
        for (const dep of step.needs) {
          markdown += `  ${dep} --> ${step.id}\n`;
        }
      }
    }

    markdown += "```\n\n";

    markdown += `## Steps\n\n`;
    for (const step of workflow.steps) {
      markdown += `### ${step.id}\n\n`;
      markdown += `- **Type**: ${step.type}\n`;
      if (step.description) markdown += `- **Description**: ${step.description}\n`;
      if (step.agent) markdown += `- **Agent**: ${step.agent}\n`;
      if (step.needs?.length) markdown += `- **Dependencies**: ${step.needs.join(", ")}\n`;
      if (step.retry) markdown += `- **Retries**: ${step.retry}\n`;
      if (step.condition) markdown += `- **Condition**: ${step.condition}\n`;
      markdown += "\n";
    }

    return markdown;
  }

  private getStepIcon(type: string): string {
    switch (type) {
      case "text": return "📝";
      case "script": return "⚙️";
      case "agent": return "🤖";
      case "condition": return "❓";
      case "loop": return "🔁";
      case "parallel": return "⚡";
      case "variable": return "📦";
      default: return "📌";
    }
  }

  private async findWorkflowFiles(): Promise<string[]> {
    const files: string[] = [];

    const searchPaths = [
      join(this.workspaceRoot, ".openflow", "workflows"),
      join(this.workspaceRoot, "workflows"),
    ];

    for (const basePath of searchPaths) {
      try {
        await access(basePath);
        const mdFiles = await this.findMarkdownFiles(basePath);
        files.push(...mdFiles);
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return files;
  }

  private parseWorkflowFile(content: string, filePath: string): WorkflowDefinition {
    const frontMatter = this.parseFrontMatter(content) as Record<string, unknown>;
    const body = content.replace(/^---\n[\s\S]*?\n---/, "").trim();

    const steps = (frontMatter.steps as WorkflowStep[]) || [];
    const workflowMode = String(frontMatter.mode || "sequential") as WorkflowMode;

    return {
      name: String(frontMatter.name || filePath.split("/").pop()?.replace(".md", "") || "unknown"),
      description: String(frontMatter.description || ""),
      mode: workflowMode,
      steps,
      variables: frontMatter.variables as Record<string, string> | undefined,
      timeout: Number(frontMatter.timeout) || undefined,
      maxConcurrency: Number(frontMatter.maxConcurrency) || undefined,
      onError: (frontMatter.onError as "abort" | "continue") || undefined,
    };
  }

  private extractWorkflowFromSkill(skill: SkillPackage): WorkflowDefinition {
    const fm = skill.frontMatter as Record<string, unknown>;
    const workflowConfig = fm.workflow as Record<string, unknown> | undefined;
    const steps = (workflowConfig?.steps as WorkflowStep[]) || [];

    return {
      name: `${skill.name}:workflow`,
      description: `Workflow for skill: ${skill.description}`,
      mode: (workflowConfig?.mode as WorkflowMode) || WorkflowMode.SEQUENTIAL,
      steps,
    };
  }

  getSkillListing(): Array<{ name: string; description: string; source: string; isActive: boolean }> {
    const result: Array<{ name: string; description: string; source: string; isActive: boolean }> = [];

    for (const [name, skill] of this.skills) {
      result.push({
        name: skill.qualifiedName,
        description: skill.description,
        source: skill.source,
        isActive: skill.isActive,
      });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async loadSkillFullContent(qualifiedName: string): Promise<SkillPackage> {
    const skill = this.skills.get(qualifiedName);
    if (!skill) {
      throw new Error(`Skill not found: ${qualifiedName}`);
    }

    for (const ref of skill.references) {
      if (!ref.content) {
        ref.content = await readFile(ref.path, "utf-8");
      }
    }

    for (const template of skill.templates) {
      if (!template.content) {
        template.content = await readFile(template.path, "utf-8");
      }
    }

    return skill;
  }

  async executeSkill(qualifiedName: string, args?: Record<string, unknown>): Promise<string> {
    const skill = await this.loadSkillFullContent(qualifiedName);

    if (skill.frontMatter["disable-model-invocation"] && !this.isUserInvocation) {
      throw new Error(`Skill ${qualifiedName} cannot be auto-invoked`);
    }

    let renderedContent = skill.skillMd.content || "";

    renderedContent = this.substituteArguments(renderedContent, args, skill.frontMatter.arguments);

    renderedContent = await this.injectShellCommands(renderedContent, skill);

    if (skill.frontMatter.context === "fork") {
      return this.executeInSubAgent(skill, renderedContent);
    }

    for (const script of skill.scripts) {
      if (this.shouldExecuteScript(script, renderedContent)) {
        await this.executeScript(script.path, args);
      }
    }

    this.logExecution({
      script: qualifiedName,
      type: AssetType.MARKDOWN,
      args,
      success: true,
      duration: 0,
      timestamp: new Date().toISOString(),
    });

    return renderedContent;
  }

  async executeCommand(name: string, args?: Record<string, unknown>): Promise<string> {
    const command = this.commands.get(name);
    if (!command) {
      throw new Error(`Command not found: ${name}`);
    }

    let renderedContent = command.template;
    renderedContent = this.substituteArguments(renderedContent, args, command.frontMatter.arguments);
    renderedContent = await this.injectShellCommands(renderedContent, command as unknown as SkillPackage);

    for (const script of command.scripts) {
      if (this.shouldExecuteScript(script, renderedContent)) {
        await this.executeScript(script.path, args);
      }
    }

    return renderedContent;
  }

  async executeScript(scriptPath: string, args?: Record<string, unknown>): Promise<string> {
    const absolutePath = resolve(this.workspaceRoot, scriptPath);
    await this.validatePath(absolutePath);

    const asset = await this.loadFile(absolutePath);

    const securityLevel = this.assessSecurityLevel(asset.type, scriptPath);
    if (securityLevel === SecurityLevel.BLOCKED) {
      throw new Error(`Execution blocked: ${scriptPath} violates security policy`);
    }

    if (securityLevel === SecurityLevel.DANGEROUS && this.sandbox) {
      throw new Error(`Execution requires user confirmation: ${scriptPath}`);
    }

    const startTime = Date.now();

    try {
      let result: string;

      switch (asset.type) {
        case AssetType.JAVASCRIPT:
          result = await this.executeJavaScript(absolutePath, args);
          break;
        case AssetType.PYTHON:
          result = await this.executePython(absolutePath, args);
          break;
        case AssetType.SHELL:
          result = await this.executeShell(absolutePath, args);
          break;
        case AssetType.HTML:
          result = await this.serveHTML(absolutePath);
          break;
        default:
          throw new Error(`Cannot execute file type: ${asset.type}`);
      }

      this.logExecution({
        script: scriptPath,
        type: asset.type,
        args,
        success: true,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      this.logExecution({
        script: scriptPath,
        type: asset.type,
        args,
        success: false,
        duration: Date.now() - startTime,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async loadFile(filePath: string): Promise<AssetFile> {
    const absolutePath = resolve(this.workspaceRoot, filePath);
    await this.validatePath(absolutePath);

    const ext = extname(absolutePath).toLowerCase();
    const type = this.detectAssetType(ext);

    if (!this.securityPolicy.allowedFileTypes.includes(type) && type !== AssetType.UNKNOWN) {
      throw new Error(`File type not allowed: ${type}`);
    }

    const fileStat = await stat(absolutePath);

    const asset: AssetFile = {
      path: absolutePath,
      name: absolutePath.split("/").pop() || "unknown",
      type,
      executable: (fileStat.mode & 0o111) !== 0,
    };

    if (this.isTextBasedType(type)) {
      asset.content = await readFile(absolutePath, "utf-8");
    }

    return asset;
  }

  registerTool(toolName: string): void {
    this.availableTools.add(toolName);
    this.reevaluateSkillActivation();
  }

  unregisterTool(toolName: string): void {
    this.availableTools.delete(toolName);
    this.reevaluateSkillActivation();
  }

  registerToolSet(toolSetName: string): void {
    this.availableToolSets.add(toolSetName);
    this.reevaluateSkillActivation();
  }

  unregisterToolSet(toolSetName: string): void {
    this.availableToolSets.delete(toolSetName);
    this.reevaluateSkillActivation();
  }

  getExecutionLog(): ExecutionRecord[] {
    return [...this.executionLog];
  }

  updateSecurityPolicy(policy: Partial<SecurityPolicy>): void {
    this.securityPolicy = { ...this.securityPolicy, ...policy };
  }

  dispose(): void {
    for (const [, watcher] of this.watchers) {
      (watcher as unknown as { close?: () => void }).close?.();
    }
    this.watchers.clear();
  }

  private isUserInvocation = false;

  async loadSkillPackage(skillDir: string, source = "local", pluginName?: string): Promise<SkillPackage> {
    const absoluteDir = resolve(this.workspaceRoot, skillDir);
    await this.validatePath(absoluteDir);

    const skillMdPath = join(absoluteDir, "SKILL.md");
    const skillMd = await this.loadMarkdownFile(skillMdPath);

    const frontMatter = skillMd.metadata as SkillFrontMatter || {};

    const scripts = await this.scanDirectory(join(absoluteDir, "scripts"), this.isScriptFile);
    const references = await this.scanDirectory(join(absoluteDir, "references"), () => true);
    const templates = await this.scanDirectory(join(absoluteDir, "templates"), () => true);
    const assets = await this.scanDirectory(join(absoluteDir, "assets"), () => true);

    const baseName = frontMatter.name || skillDir.split("/").pop() || "unknown";
    const qualifiedName = pluginName ? `${pluginName}:${baseName}` : baseName;

    return {
      name: baseName,
      description: String(frontMatter.description || ""),
      qualifiedName,
      frontMatter,
      skillMd,
      scripts,
      references,
      templates,
      assets,
      source,
      isActive: false,
    };
  }

  private async loadCommandPackage(commandDir: string, source = "local"): Promise<CommandPackage> {
    const absoluteDir = resolve(this.workspaceRoot, commandDir);
    await this.validatePath(absoluteDir);

    const entries = await this.scanDirectory(absoluteDir, () => true);
    const mdFile = entries.find((e) => e.type === AssetType.MARKDOWN);

    if (!mdFile) {
      throw new Error(`No markdown file found in command directory: ${commandDir}`);
    }

    const frontMatter = mdFile.metadata as CommandFrontMatter || {};

    return {
      name: String(frontMatter.name || mdFile.name.replace(".md", "")),
      description: String(frontMatter.description || ""),
      template: mdFile.content || "",
      frontMatter,
      scripts: entries.filter((e) => this.isScriptFile(e)),
      source,
    };
  }

  private async loadAgentFile(agentPath: string, source = "local"): Promise<AgentPackage> {
    const absolutePath = resolve(this.workspaceRoot, agentPath);
    await this.validatePath(absolutePath);

    const content = await readFile(absolutePath, "utf-8");
    const frontMatter = this.parseFrontMatter(content) as AgentFrontMatter;
    const body = content.replace(/^---\n[\s\S]*?\n---/, "").trim();

    return {
      name: String(frontMatter.name || agentPath.split("/").pop()?.replace(".md", "") || "unknown"),
      description: String(frontMatter.description || ""),
      systemPrompt: body,
      frontMatter,
      source,
    };
  }

  private substituteArguments(
    content: string,
    args?: Record<string, unknown>,
    argumentNames?: string[]
  ): string {
    if (!args || Object.keys(args).length === 0) return content;

    const argValues = Object.values(args);

    let result = content;

    result = result.replace(/\$ARGUMENTS/g, String(args));

    for (let i = 0; i < argValues.length; i++) {
      result = result.replace(new RegExp(`\\$ARGUMENTS\\[${i}\\]`, "g"), String(argValues[i]));
      result = result.replace(new RegExp(`\\$${i}`, "g"), String(argValues[i]));
    }

    if (argumentNames) {
      for (let i = 0; i < argumentNames.length; i++) {
        const name = argumentNames[i];
        if (argValues[i] !== undefined) {
          result = result.replace(new RegExp(`\\$${name}`, "g"), String(argValues[i]));
        }
      }
    }

    if (!content.includes("$ARGUMENTS") && !content.match(/\$\d/) && !argumentNames?.some((n) => content.includes(`$${n}`))) {
      result += `\n\nARGUMENTS: ${JSON.stringify(args)}`;
    }

    return result;
  }

  private async injectShellCommands(content: string, skill: SkillPackage): Promise<string> {
    if (this.securityPolicy.disableSkillShellExecution) {
      return content.replace(/!`[^`]+`/g, "[shell command execution disabled by policy]");
    }

    const inlinePattern = /!`([^`]+)`/g;
    const blockPattern = /```!\n([\s\S]*?)\n```/g;

    let result = content;

    const inlineMatches = content.match(inlinePattern);
    if (inlineMatches) {
      for (const match of inlineMatches) {
        const command = match.slice(2, -1);
        try {
          const { stdout } = await execAsync(command, {
            cwd: this.workspaceRoot,
            timeout: this.securityPolicy.maxExecutionTime,
            env: this.buildSecureEnvironment(),
          });
          result = result.replace(match, stdout.trim());
        } catch (error) {
          result = result.replace(match, `[shell error: ${(error as Error).message}]`);
        }
      }
    }

    const blockMatches = content.match(blockPattern);
    if (blockMatches) {
      for (const match of blockMatches) {
        const commands = match.slice(4, -3);
        try {
          const { stdout } = await execAsync(commands, {
            cwd: this.workspaceRoot,
            timeout: this.securityPolicy.maxExecutionTime,
            env: this.buildSecureEnvironment(),
          });
          result = result.replace(match, stdout.trim());
        } catch (error) {
          result = result.replace(match, `[shell error: ${(error as Error).message}]`);
        }
      }
    }

    return result;
  }

  private async executeInSubAgent(skill: SkillPackage, content: string): Promise<string> {
    this.emit("subagent:spawn", {
      skill: skill.qualifiedName,
      agent: skill.frontMatter.agent || "general-purpose",
      prompt: content,
    });

    return `[SubAgent execution would happen here - integrates with SubAgentCoordinator]`;
  }

  private shouldExecuteScript(script: AssetFile, content: string): boolean {
    return content.includes(script.name) || content.includes(relative(this.workspaceRoot, script.path));
  }

  private async findSkillDirectories(): Promise<string[]> {
    const dirs: string[] = [];

    const searchPaths = [
      join(this.workspaceRoot, ".openflow", "skills"),
      join(this.workspaceRoot, "skills"),
    ];

    for (const basePath of searchPaths) {
      try {
        await access(basePath);
        const subdirs = await this.findSubdirectories(basePath);
        for (const subdir of subdirs) {
          const skillMdPath = join(subdir, "SKILL.md");
          try {
            await access(skillMdPath);
            dirs.push(subdir);
          } catch {
            // No SKILL.md, skip
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return dirs;
  }

  private async findCommandDirectories(): Promise<string[]> {
    const dirs: string[] = [];

    const searchPaths = [
      join(this.workspaceRoot, ".openflow", "commands"),
      join(this.workspaceRoot, "commands"),
    ];

    for (const basePath of searchPaths) {
      try {
        await access(basePath);
        const subdirs = await this.findSubdirectories(basePath);
        for (const subdir of subdirs) {
          const mdFiles = await this.findMarkdownFiles(subdir);
          if (mdFiles.length > 0) {
            dirs.push(subdir);
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return dirs;
  }

  private async findAgentFiles(): Promise<string[]> {
    const files: string[] = [];

    const searchPaths = [
      join(this.workspaceRoot, ".openflow", "agents"),
      join(this.workspaceRoot, "agents"),
    ];

    for (const basePath of searchPaths) {
      try {
        await access(basePath);
        const mdFiles = await this.findMarkdownFiles(basePath);
        files.push(...mdFiles);
      } catch {
        // Directory doesn't exist, skip
      }
    }

    return files;
  }

  private async findSubdirectories(dirPath: string): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dirPath, { withFileTypes: true });
    const subdirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        subdirs.push(join(dirPath, entry.name));
        subdirs.push(...await this.findSubdirectories(join(dirPath, entry.name)));
      }
    }

    return subdirs;
  }

  private async findMarkdownFiles(dirPath: string): Promise<string[]> {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.findMarkdownFiles(fullPath));
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".markdown")) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private isSkillActive(skill: SkillPackage): boolean {
    if (skill.frontMatter.requires_tools) {
      const hasRequiredTools = skill.frontMatter.requires_tools.every((t) => this.availableTools.has(t));
      if (!hasRequiredTools) return false;
    }

    if (skill.frontMatter.requires_toolsets) {
      const hasRequiredToolSets = skill.frontMatter.requires_toolsets.every((ts) => this.availableToolSets.has(ts));
      if (!hasRequiredToolSets) return false;
    }

    if (skill.frontMatter.fallback_for_tools) {
      const hasFallbackTools = skill.frontMatter.fallback_for_tools.some((t) => this.availableTools.has(t));
      if (hasFallbackTools) return false;
    }

    if (skill.frontMatter.fallback_for_toolsets) {
      const hasFallbackToolSets = skill.frontMatter.fallback_for_toolsets.some((ts) => this.availableToolSets.has(ts));
      if (hasFallbackToolSets) return false;
    }

    if (skill.frontMatter.platforms) {
      const platform = process.platform;
      const platformMap: Record<string, string> = {
        darwin: "macos",
        linux: "linux",
        win32: "windows",
      };
      if (!skill.frontMatter.platforms.includes(platformMap[platform] || platform)) {
        return false;
      }
    }

    return true;
  }

  private reevaluateSkillActivation(): void {
    for (const [name, skill] of this.skills) {
      const wasActive = skill.isActive;
      skill.isActive = this.isSkillActive(skill);

      if (wasActive && !skill.isActive) {
        this.emit("skill:deactivated", skill);
      } else if (!wasActive && skill.isActive) {
        this.emit("skill:activated", skill);
      }
    }
  }

  private setupWatchers(): void {
    const watchPaths = [
      join(this.workspaceRoot, ".openflow"),
    ];

    for (const watchPath of watchPaths) {
      this.setupWatcher(watchPath);
    }
  }

  private async setupWatcher(dirPath: string): Promise<void> {
    try {
      await access(dirPath);
    } catch {
      return;
    }

    const watcher = watch(dirPath, { recursive: true });

    (async () => {
      for await (const event of watcher) {
        const filename = event.filename;
        if (filename && (filename.endsWith(".md") || filename.endsWith("SKILL.md"))) {
          this.emit("file:changed", { path: join(dirPath, filename) });
          this.reloadAffected(join(dirPath, filename));
        }
      }
    })();

    this.watchers.set(dirPath, watcher);
  }

  private async reloadAffected(filePath: string): Promise<void> {
    if (filePath.includes("skills") && filePath.includes("SKILL.md")) {
      const skillDir = dirname(filePath);
      try {
        const skill = await this.loadSkillPackage(skillDir);
        if (this.isSkillActive(skill)) {
          this.skills.set(skill.qualifiedName, skill);
          this.emit("skill:reloaded", skill);
        }
      } catch (error) {
        this.emit("skill:reload_error", { path: filePath, error });
      }
    }
  }

  private async scanDirectory(dirPath: string, filter: (file: AssetFile) => boolean): Promise<AssetFile[]> {
    try {
      await access(dirPath);
    } catch {
      return [];
    }

    return this.scanDirectoryRecursive(dirPath, filter);
  }

  private async scanDirectoryRecursive(dirPath: string, filter?: (file: AssetFile) => boolean): Promise<AssetFile[]> {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(dirPath, { withFileTypes: true });
    const results: AssetFile[] = [];

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        results.push(...await this.scanDirectoryRecursive(fullPath, filter));
      } else {
        const asset = await this.loadFile(fullPath);
        if (!filter || filter(asset)) {
          results.push(asset);
        }
      }
    }

    return results;
  }

  private async loadMarkdownFile(filePath: string): Promise<AssetFile> {
    const asset = await this.loadFile(filePath);
    asset.metadata = this.parseFrontMatter(asset.content || "");
    return asset;
  }

  private async executeJavaScript(scriptPath: string, args?: Record<string, unknown>): Promise<string> {
    const scriptDir = dirname(scriptPath);
    const require = createRequire(scriptPath);

    try {
      const mod = require(scriptPath);
      if (typeof mod.default === "function") {
        const result = await mod.default(args);
        return JSON.stringify(result);
      }
      if (typeof mod === "function") {
        const result = await mod(args);
        return JSON.stringify(result);
      }
    } catch {
      // Fallback to child process execution
    }

    const jsonArgs = args ? `'${JSON.stringify(args).replace(/'/g, "'\\''")}'` : "";
    const { stdout, stderr } = await execAsync(`node "${scriptPath}" ${jsonArgs}`, {
      cwd: scriptDir,
      timeout: this.securityPolicy.maxExecutionTime,
      env: this.buildSecureEnvironment(),
    });

    return stdout || stderr;
  }

  private async executePython(scriptPath: string, args?: Record<string, unknown>): Promise<string> {
    const scriptDir = dirname(scriptPath);
    const jsonArgs = args ? `'${JSON.stringify(args).replace(/'/g, "'\\''")}'` : "";

    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}" ${jsonArgs}`, {
      cwd: scriptDir,
      timeout: this.securityPolicy.maxExecutionTime,
      env: this.buildSecureEnvironment(),
    });

    return stdout || stderr;
  }

  private async executeShell(scriptPath: string, args?: Record<string, unknown>): Promise<string> {
    const scriptDir = dirname(scriptPath);
    const content = await readFile(scriptPath, "utf-8");

    this.validateShellScript(content);

    const envArgs = args ? Object.entries(args).map(([k, v]) => `${k}='${String(v).replace(/'/g, "'\\''")}'`).join(" ") : "";

    const { stdout, stderr } = await execAsync(`${envArgs} bash "${scriptPath}"`, {
      cwd: scriptDir,
      timeout: this.securityPolicy.maxExecutionTime,
      env: this.buildSecureEnvironment(),
    });

    return stdout || stderr;
  }

  private async serveHTML(filePath: string): Promise<string> {
    const content = await readFile(filePath, "utf-8");

    if (this.sandbox) {
      const sanitized = this.sanitizeHTML(content);
      return sanitized;
    }

    return content;
  }

  private validateShellScript(content: string): void {
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) continue;

      for (const blocked of this.securityPolicy.blockedCommands) {
        if (trimmed.includes(blocked)) {
          throw new Error(`Blocked command detected in shell script: ${blocked}`);
        }
      }
    }

    if (!this.securityPolicy.allowNetworkAccess) {
      const networkPatterns = [/curl\s/, /wget\s/, /nc\s/, /netcat\s/, /ssh\s/, /scp\s/];
      for (const pattern of networkPatterns) {
        if (pattern.test(content)) {
          throw new Error("Network access is not allowed in shell scripts");
        }
      }
    }

    if (!this.securityPolicy.allowFileSystemWrite) {
      const writePatterns = [/> /, />> /, /tee\s/, /rm\s/, /mv\s/, /cp\s/];
      for (const pattern of writePatterns) {
        if (pattern.test(content)) {
          throw new Error("File system write is not allowed in shell scripts");
        }
      }
    }
  }

  private sanitizeHTML(content: string): string {
    const dangerousPatterns = [
      /<script[\s\S]*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[\s\S]*?>/gi,
      /<object[\s\S]*?>/gi,
      /<embed[\s\S]*?>/gi,
      /<form[\s\S]*?>/gi,
      /eval\(/gi,
      /document\.cookie/gi,
      /localStorage/gi,
      /sessionStorage/gi,
    ];

    let sanitized = content;
    for (const pattern of dangerousPatterns) {
      sanitized = sanitized.replace(pattern, "");
    }

    return sanitized;
  }

  private assessSecurityLevel(type: AssetType, path: string): SecurityLevel {
    if (!this.securityPolicy.allowedFileTypes.includes(type)) {
      return SecurityLevel.BLOCKED;
    }

    if (this.securityPolicy.requireUserConfirmation.includes(type)) {
      return SecurityLevel.DANGEROUS;
    }

    if (type === AssetType.SHELL || type === AssetType.PYTHON) {
      return SecurityLevel.RESTRICTED;
    }

    return SecurityLevel.SAFE;
  }

  private buildSecureEnvironment(): NodeJS.ProcessEnv {
    const secureEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: this.workspaceRoot,
      NODE_ENV: "production",
      PYTHONUNBUFFERED: "1",
    };

    if (!this.securityPolicy.allowNetworkAccess) {
      secureEnv.HTTP_PROXY = "";
      secureEnv.HTTPS_PROXY = "";
      secureEnv.NO_PROXY = "*";
    }

    return secureEnv;
  }

  private logExecution(record: ExecutionRecord): void {
    this.executionLog.push(record);

    if (this.executionLog.length > 1000) {
      this.executionLog = this.executionLog.slice(-500);
    }
  }

  private detectAssetType(ext: string): AssetType {
    const map: Record<string, AssetType> = {
      ".md": AssetType.MARKDOWN,
      ".markdown": AssetType.MARKDOWN,
      ".js": AssetType.JAVASCRIPT,
      ".mjs": AssetType.JAVASCRIPT,
      ".cjs": AssetType.JAVASCRIPT,
      ".ts": AssetType.JAVASCRIPT,
      ".py": AssetType.PYTHON,
      ".sh": AssetType.SHELL,
      ".bash": AssetType.SHELL,
      ".html": AssetType.HTML,
      ".htm": AssetType.HTML,
      ".json": AssetType.JSON,
      ".yaml": AssetType.YAML,
      ".yml": AssetType.YAML,
      ".tex": AssetType.LATEX,
      ".sty": AssetType.LATEX,
      ".bib": AssetType.BIBTEX,
      ".bst": AssetType.BIBTEX,
      ".xsd": AssetType.XML,
      ".xml": AssetType.XML,
      ".pdf": AssetType.PDF,
      ".wav": AssetType.AUDIO,
      ".mp3": AssetType.AUDIO,
      ".txt": AssetType.TEXT,
      "makefile": AssetType.MAKEFILE,
    };

    return map[ext] || AssetType.UNKNOWN;
  }

  private isTextBasedType(type: AssetType): boolean {
    return [
      AssetType.MARKDOWN,
      AssetType.JAVASCRIPT,
      AssetType.PYTHON,
      AssetType.SHELL,
      AssetType.HTML,
      AssetType.JSON,
      AssetType.YAML,
      AssetType.LATEX,
      AssetType.BIBTEX,
      AssetType.XML,
      AssetType.TEXT,
      AssetType.MAKEFILE,
    ].includes(type);
  }

  private isScriptFile(file: AssetFile): boolean {
    return [
      AssetType.JAVASCRIPT,
      AssetType.PYTHON,
      AssetType.SHELL,
    ].includes(file.type);
  }

  private parseFrontMatter(content: string): Record<string, unknown> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};

    const frontMatter = match[1];
    const result: Record<string, unknown> = {};

    for (const line of frontMatter.split("\n")) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      if (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
        try {
          value = JSON.parse(value);
        } catch {
          value = (value as string).slice(1, -1).split(",").map((s: string) => s.trim());
        }
      } else if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string
        }
      } else if (value === "true") {
        value = true;
      } else if (value === "false") {
        value = false;
      } else if (typeof value === "string" && !isNaN(Number(value)) && value !== "") {
        value = Number(value);
      }

      result[key] = value;
    }

    return result;
  }

  private async validatePath(filePath: string): Promise<void> {
    if (!this.sandbox) return;

    const resolved = resolve(filePath);
    if (!resolved.startsWith(this.workspaceRoot)) {
      throw new Error(`Path traversal detected: ${filePath}`);
    }

    try {
      await access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }
  }
}

export interface ExecutionRecord {
  script: string;
  type: AssetType;
  args?: Record<string, unknown>;
  success: boolean;
  duration: number;
  error?: string;
  timestamp: string;
}
