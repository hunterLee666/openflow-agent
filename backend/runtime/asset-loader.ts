import { readFile, access, stat } from "node:fs/promises";
import { join, resolve, extname, dirname } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";

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

export interface AssetFile {
  path: string;
  name: string;
  type: AssetType;
  content?: string;
  executable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SkillDocumentation {
  sop?: AssetFile;
  troubleshooting?: AssetFile;
}

export interface SkillPackage {
  name: string;
  description: string;
  skillMd: AssetFile;
  scripts: AssetFile[];
  references: AssetFile[];
  templates: AssetFile[];
  assets: AssetFile[];
  compatibility?: {
    nodejs?: string;
    python?: string;
  };
  documentation?: SkillDocumentation;
}

export interface CommandPackage {
  name: string;
  description: string;
  template: string;
  allowedTools?: string[];
  scripts?: AssetFile[];
}

export interface AgentPackage {
  name: string;
  description: string;
  systemPrompt: string;
  frontMatter?: Record<string, unknown>;
  tools?: string[] | null;
  restrictedTools?: string[];
  model?: string;
  skills?: string[] | null;
  maxTurns?: number;
  timeoutSeconds?: number;
  temperature?: number;
  maxTokens?: number;
  source?: string;
}

export enum SecurityLevel {
  SAFE = "safe",
  RESTRICTED = "restricted",
  DANGEROUS = "dangerous",
  BLOCKED = "blocked",
}

export interface SecurityPolicy {
  allowedFileTypes: AssetType[];
  allowedCommands: string[];
  blockedCommands: string[];
  maxExecutionTime: number;
  maxMemoryMB: number;
  allowNetworkAccess: boolean;
  allowFileSystemWrite: boolean;
  allowedWritePaths: string[];
  requireUserConfirmation: AssetType[];
}

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
  ],
  blockedCommands: [
    "rm -rf",
    "rm -f",
    "sudo",
    "chmod 777",
    "curl",
    "wget",
    "nc",
    "netcat",
    "ssh",
    "scp",
    "dd",
    "mkfs",
    "fdisk",
    "shutdown",
    "reboot",
    "kill",
    "pkill",
    "killall",
    "iptables",
    "ufw",
    "firewall",
    "eval",
    "exec",
    "source",
    "base64 -d",
    "openssl",
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
};

export class AssetLoader {
  private workspaceRoot: string;
  private sandbox: boolean;
  private securityPolicy: SecurityPolicy;
  private executionLog: ExecutionRecord[] = [];

  constructor(workspaceRoot: string, sandbox = true, securityPolicy?: Partial<SecurityPolicy>) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.sandbox = sandbox;
    this.securityPolicy = { ...DEFAULT_SECURITY_POLICY, ...securityPolicy };
  }

  async loadSkillPackage(skillDir: string): Promise<SkillPackage> {
    const absoluteDir = resolve(this.workspaceRoot, skillDir);
    await this.validatePath(absoluteDir);

    const skillMdPath = join(absoluteDir, "SKILL.md");
    const skillMd = await this.loadMarkdownFile(skillMdPath);

    const scripts = await this.scanDirectory(join(absoluteDir, "scripts"), this.isScriptFile);
    const references = await this.scanDirectory(join(absoluteDir, "references"), () => true);
    const templates = await this.scanDirectory(join(absoluteDir, "templates"), () => true);
    const assets = await this.scanDirectory(join(absoluteDir, "assets"), () => true);

    const documentation = await this.loadSkillDocumentation(absoluteDir);

    const frontMatter = this.parseFrontMatter(skillMd.content || "");

    return {
      name: String(frontMatter.name || skillDir.split("/").pop() || "unknown"),
      description: String(frontMatter.description || ""),
      skillMd,
      scripts,
      references,
      templates,
      assets,
      compatibility: frontMatter.compatibility as { nodejs?: string; python?: string } | undefined,
      documentation,
    };
  }

  private async loadSkillDocumentation(skillDir: string): Promise<SkillDocumentation | undefined> {
    const documentation: SkillDocumentation = {};

    const sopPath = join(skillDir, "SOP.md");
    try {
      documentation.sop = await this.loadMarkdownFile(sopPath);
    } catch {
      // SOP.md is optional
    }

    const troubleshootingPath = join(skillDir, "troubleshooting.md");
    try {
      documentation.troubleshooting = await this.loadMarkdownFile(troubleshootingPath);
    } catch {
      // troubleshooting.md is optional
    }

    return Object.keys(documentation).length > 0 ? documentation : undefined;
  }

  async loadCommandPackage(commandDir: string): Promise<CommandPackage> {
    const absoluteDir = resolve(this.workspaceRoot, commandDir);
    await this.validatePath(absoluteDir);

    const entries = await this.scanDirectory(absoluteDir, () => true);
    const mdFile = entries.find((e) => e.type === AssetType.MARKDOWN);

    if (!mdFile) {
      throw new Error(`No markdown file found in command directory: ${commandDir}`);
    }

    const frontMatter = this.parseFrontMatter(mdFile.content || "");
    const scripts = entries.filter((e) => this.isScriptFile(e));

    return {
      name: String(frontMatter.name || mdFile.name),
      description: String(frontMatter.description || ""),
      template: mdFile.content || "",
      allowedTools: frontMatter.allowedTools as string[] | undefined,
      scripts,
    };
  }

  async loadAgentFile(agentPath: string): Promise<AgentPackage> {
    const absolutePath = resolve(this.workspaceRoot, agentPath);
    await this.validatePath(absolutePath);

    const content = await readFile(absolutePath, "utf-8");
    const frontMatter = this.parseFrontMatter(content);
    const body = content.replace(/^---\n[\s\S]*?\n---/, "").trim();

    return {
      name: String(frontMatter.name || agentPath.split("/").pop()?.replace(".md", "") || "unknown"),
      description: String(frontMatter.description || ""),
      systemPrompt: body,
      tools: frontMatter.tools as string[] | undefined,
      model: String(frontMatter.model || ""),
      skills: frontMatter.skills as string[] | undefined,
    };
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

  async loadAllAssets(skillDir: string): Promise<AssetFile[]> {
    const absoluteDir = resolve(this.workspaceRoot, skillDir);
    await this.validatePath(absoluteDir);

    return this.scanDirectoryRecursive(absoluteDir);
  }

  getExecutionLog(): ExecutionRecord[] {
    return [...this.executionLog];
  }

  updateSecurityPolicy(policy: Partial<SecurityPolicy>): void {
    this.securityPolicy = { ...this.securityPolicy, ...policy };
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

      if (typeof value === "string") {
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("[") && value.endsWith("]")) {
          try {
            value = JSON.parse(value);
          } catch {
            value = (value as string).slice(1, -1).split(",").map((s: string) => s.trim());
          }
        } else if (value.startsWith("{") && value.endsWith("}")) {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string
          }
        } else if (value === "true") {
          value = true;
        } else if (value === "false") {
          value = false;
        } else if (!isNaN(Number(value)) && value !== "") {
          value = Number(value);
        }
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
