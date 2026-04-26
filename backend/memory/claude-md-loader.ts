import { readFile, stat } from "node:fs/promises";
import { join, dirname, resolve, homedir } from "node:path";
import { existsSync } from "node:fs";

export interface ClaudeMdLayer {
  source: "global" | "project" | "directory" | "local";
  path: string;
  content: string;
  lineCount: number;
}

export interface ClaudeMdStackResult {
  layers: ClaudeMdLayer[];
  mergedContent: string;
  warnings: string[];
}

const GLOBAL_CLAUDE_MD = join(homedir(), ".claude", "CLAUDE.md");
const LOCAL_CLAUDE_MD = ".claude/CLAUDE.local.md";
const PROJECT_CLAUDE_MD = "CLAUDE.md";

const MIN_LINES = 50;
const MAX_LINES = 200;
const MAX_TOTAL_LINES = 500;

export class ClaudeMdLoader {
  async loadStack(cwd: string): Promise<ClaudeMdStackResult> {
    const layers: ClaudeMdLayer[] = [];
    const warnings: string[] = [];

    const projectRoot = await this.findProjectRoot(cwd);

    const globalContent = await this.readIfExists(GLOBAL_CLAUDE_MD);
    if (globalContent) {
      const lineCount = globalContent.split("\n").length;
      layers.push({
        source: "global",
        path: GLOBAL_CLAUDE_MD,
        content: globalContent,
        lineCount,
      });
      if (lineCount > MAX_LINES) {
        warnings.push(`Global CLAUDE.md has ${lineCount} lines (recommended: ${MIN_LINES}-${MAX_LINES})`);
      }
    }

    const projectPath = join(projectRoot, PROJECT_CLAUDE_MD);
    const projectContent = await this.readIfExists(projectPath);
    if (projectContent) {
      const lineCount = projectContent.split("\n").length;
      layers.push({
        source: "project",
        path: projectPath,
        content: projectContent,
        lineCount,
      });
      if (lineCount > MAX_LINES) {
        warnings.push(`Project CLAUDE.md has ${lineCount} lines (recommended: ${MIN_LINES}-${MAX_LINES})`);
      }
    }

    const directoryLayers = await this.loadDirectoryLayers(cwd, projectRoot);
    layers.push(...directoryLayers);

    const localPath = join(projectRoot, LOCAL_CLAUDE_MD);
    const localContent = await this.readIfExists(localPath);
    if (localContent) {
      const lineCount = localContent.split("\n").length;
      layers.push({
        source: "local",
        path: localPath,
        content: localContent,
        lineCount,
      });
    }

    const mergedContent = this.mergeLayers(layers);
    const totalLines = mergedContent.split("\n").length;
    if (totalLines > MAX_TOTAL_LINES) {
      warnings.push(`Total CLAUDE.md stack has ${totalLines} lines (max: ${MAX_TOTAL_LINES}). Consider trimming.`);
    }

    return { layers, mergedContent, warnings };
  }

  private async loadDirectoryLayers(cwd: string, projectRoot: string): Promise<ClaudeMdLayer[]> {
    const layers: ClaudeMdLayer[] = [];
    const ancestors = this.getAncestorsFromRootTo(cwd, projectRoot);

    for (const dir of ancestors) {
      const dirClaudeMd = join(dir, PROJECT_CLAUDE_MD);
      const content = await this.readIfExists(dirClaudeMd);
      if (content) {
        const lineCount = content.split("\n").length;
        layers.push({
          source: "directory",
          path: dirClaudeMd,
          content,
          lineCount,
        });
        if (lineCount > MAX_LINES) {
          console.warn(`Directory CLAUDE.md at ${dirClaudeMd} has ${lineCount} lines`);
        }
      }
    }

    return layers;
  }

  private getAncestorsFromRootTo(cwd: string, projectRoot: string): string[] {
    const ancestors: string[] = [];
    let current = resolve(cwd);
    const root = resolve(projectRoot);

    const pathParts: string[] = [];
    while (current !== root && current !== dirname(current)) {
      pathParts.unshift(current);
      current = dirname(current);
    }
    pathParts.unshift(root);

    return pathParts;
  }

  private async findProjectRoot(cwd: string): Promise<string> {
    let current = resolve(cwd);
    const root = resolve(homedir());

    while (current !== root) {
      const hasGit = existsSync(join(current, ".git"));
      const hasClaudeMd = existsSync(join(current, PROJECT_CLAUDE_MD));

      if (hasGit || hasClaudeMd) {
        return current;
      }

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return resolve(cwd);
  }

  private mergeLayers(layers: ClaudeMdLayer[]): string {
    const parts: string[] = [];

    for (const layer of layers) {
      const sourceLabel = {
        global: "Global",
        project: "Project",
        directory: "Directory",
        local: "Local (Personal)",
      }[layer.source];

      parts.push(`<!-- Source: ${sourceLabel} (${layer.path}) -->`);
      parts.push(layer.content);
      parts.push("");
    }

    return parts.join("\n\n---\n\n");
  }

  private async readIfExists(path: string): Promise<string | null> {
    try {
      await stat(path);
      const content = await readFile(path, "utf-8");
      return content.trim();
    } catch {
      return null;
    }
  }
}

export function createClaudeMdLoader(): ClaudeMdLoader {
  return new ClaudeMdLoader();
}
