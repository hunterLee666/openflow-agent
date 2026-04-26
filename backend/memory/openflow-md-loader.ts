import { readFile, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { z } from "zod";

export const OpenflowMdLayerSchema = z.object({
  source: z.enum(["global", "project", "directory", "local"]),
  path: z.string(),
  content: z.string(),
  lineCount: z.number(),
});

export type OpenflowMdLayer = z.infer<typeof OpenflowMdLayerSchema>;

export const OpenflowMdStackResultSchema = z.object({
  layers: z.array(OpenflowMdLayerSchema),
  mergedContent: z.string(),
  warnings: z.array(z.string()),
});

export type OpenflowMdStackResult = z.infer<typeof OpenflowMdStackResultSchema>;

const GLOBAL_OPENFLOW_MD = join(homedir(), ".openflow", "OPENFLOW.md");
const LOCAL_OPENFLOW_MD = ".openflow/OPENFLOW.local.md";
const PROJECT_OPENFLOW_MD = ".openflow/OPENFLOW.md";
const ROOT_OPENFLOW_MD = "OPENFLOW.md";

const MIN_LINES = 50;
const MAX_LINES = 200;
const MAX_TOTAL_LINES = 500;

export class OpenflowMdLoader {
  async loadStack(cwd: string): Promise<OpenflowMdStackResult> {
    const layers: OpenflowMdLayer[] = [];
    const warnings: string[] = [];

    const projectRoot = await this.findProjectRoot(cwd);

    const globalContent = await this.readIfExists(GLOBAL_OPENFLOW_MD);
    if (globalContent) {
      const lineCount = globalContent.split("\n").length;
      layers.push({
        source: "global",
        path: GLOBAL_OPENFLOW_MD,
        content: globalContent,
        lineCount,
      });
      if (lineCount > MAX_LINES) {
        warnings.push(`Global OPENFLOW.md has ${lineCount} lines (recommended: ${MIN_LINES}-${MAX_LINES})`);
      }
    }

    const projectPath = join(projectRoot, PROJECT_OPENFLOW_MD);
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
        warnings.push(`Project OPENFLOW.md has ${lineCount} lines (recommended: ${MIN_LINES}-${MAX_LINES})`);
      }
    }

    const directoryLayers = await this.loadDirectoryLayers(cwd, projectRoot);
    layers.push(...directoryLayers);

    const localPath = join(projectRoot, LOCAL_OPENFLOW_MD);
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
      warnings.push(`Total OPENFLOW.md stack has ${totalLines} lines (max: ${MAX_TOTAL_LINES}). Consider trimming.`);
    }

    return { layers, mergedContent, warnings };
  }

  private async loadDirectoryLayers(cwd: string, projectRoot: string): Promise<OpenflowMdLayer[]> {
    const layers: OpenflowMdLayer[] = [];
    const ancestors = this.getAncestorsFromRootTo(cwd, projectRoot);

    for (const dir of ancestors) {
      const dirOpenflowMd = join(dir, PROJECT_OPENFLOW_MD);
      const content = await this.readIfExists(dirOpenflowMd);
      if (content) {
        const lineCount = content.split("\n").length;
        layers.push({
          source: "directory",
          path: dirOpenflowMd,
          content,
          lineCount,
        });
        if (lineCount > MAX_LINES) {
          console.warn(`Directory OPENFLOW.md at ${dirOpenflowMd} has ${lineCount} lines`);
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
      const hasOpenflowMd = existsSync(join(current, PROJECT_OPENFLOW_MD));

      if (hasGit || hasOpenflowMd) {
        return current;
      }

      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return resolve(cwd);
  }

  private mergeLayers(layers: OpenflowMdLayer[]): string {
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

export function createOpenflowMdLoader(): OpenflowMdLoader {
  return new OpenflowMdLoader();
}
