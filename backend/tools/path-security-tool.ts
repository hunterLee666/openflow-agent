import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { defineTool } from "./tool-factory.js";
import { resolve, isAbsolute, normalize, sep } from "node:path";

const PathSecurityCheckInputSchema = z.object({
  path: z.string().min(1, "path 不能为空"),
  workspaceRoot: z.string().optional(),
});

const PathSecurityCheckOutputSchema = z.object({
  safe: z.boolean(),
  resolvedPath: z.string(),
  pathType: z.enum(["file", "directory", "symlink", "other", "nonexistent"]),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  isWithinWorkspace: z.boolean(),
  isSensitive: z.boolean(),
});

const SENSITIVE_PATTERNS = [
  /^\/etc\//i,
  /^\/root\//i,
  /^\/sys\//i,
  /^\/proc\//i,
  /^\/dev\//i,
  /^\/boot\//i,
  /^\/opt\//i,
  /^\/srv\//i,
  /^\/var\/log\//i,
  /^\/var\/www\//i,
  /^\/\.ssh\//i,
  /^\/\.aws\//i,
  /^\/\.kube\//i,
  /^\/tmp\/\.ssh/i,
  /\.env$/i,
  /password/i,
  /secret/i,
  /credential/i,
  /api[_-]?key/i,
  /token/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.p12$/i,
  /\.pfx$/i,
];

function isSensitivePath(path: string): { isSensitive: boolean; reasons: string[] } {
  const reasons: string[] = [];

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(path)) {
      const reason = pattern.source.replace(/\\\//g, "/").replace(/\\?\.\*/g, "*").replace(/\\?\.\w+/g, ".*");
      reasons.push(`Matches sensitive pattern: ${reason}`);
    }
  }

  return {
    isSensitive: reasons.length > 0,
    reasons,
  };
}

function checkPathTraversal(path: string): { hasTraversal: boolean; attempts: string[] } {
  const attempts: string[] = [];
  const normalized = normalize(path);

  if (normalized.includes("..")) {
    attempts.push("Path contains '..' traversal attempts");
  }

  if (normalized.includes("${")) {
    attempts.push("Path contains variable interpolation");
  }

  const parts = normalized.split(/[/\\]/);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "..") {
      attempts.push(`Traversal at position ${i}: ${parts.slice(Math.max(0, i - 2), i + 3).join("/")}`);
    }
  }

  return {
    hasTraversal: attempts.length > 0,
    attempts,
  };
}

function checkAbsolutePath(path: string): { isAbsolute: boolean; canBeResolved: boolean } {
  return {
    isAbsolute: isAbsolute(path),
    canBeResolved: !path.includes("\0"),
  };
}

export function createPathSecurityTools(workspaceRoot?: string): ToolDefinition[] {
  const effectiveWorkspaceRoot = workspaceRoot || process.cwd();

  const pathSecurityCheckTool = defineTool({
    name: "PathSecurityCheck",
    description: `Check if a file path is safe to access. This tool validates:
- Whether the path is within the allowed workspace
- Whether the path contains traversal attempts (.. or symlinks escaping workspace)
- Whether the path points to sensitive system files
- Whether the path is absolute or relative
- The type of path (file, directory, symlink, etc.)

Use this tool when:
- Before reading or writing any file
- When path comes from user input or external sources
- When dealing with paths that might escape the workspace
- When you need to validate path safety before operations`,
    inputSchema: PathSecurityCheckInputSchema,
    outputSchema: PathSecurityCheckOutputSchema,
    isReadOnly: true,
    isConcurrencySafe: true,
    handler: async (input) => {
      const warnings: string[] = [];
      const errors: string[] = [];

      const targetWorkspace = input.workspaceRoot || effectiveWorkspaceRoot;

      const resolvedPath = isAbsolute(input.path)
        ? resolve(input.path)
        : resolve(targetWorkspace, input.path);

      const normalizedPath = normalize(resolvedPath);

      const traversalCheck = checkPathTraversal(input.path);
      if (traversalCheck.hasTraversal) {
        warnings.push(...traversalCheck.attempts);
      }

      const absoluteCheck = checkAbsolutePath(input.path);
      if (!absoluteCheck.canBeResolved) {
        errors.push("Path contains null bytes or other invalid characters");
      }

      const normalizedTarget = normalize(targetWorkspace);
      const isWithinWorkspace = normalizedPath.startsWith(normalizedTarget + sep) || normalizedPath === normalizedTarget;

      const sensitiveCheck = isSensitivePath(normalizedPath);
      let isSensitive = sensitiveCheck.isSensitive;
      if (sensitiveCheck.isSensitive) {
        warnings.push(...sensitiveCheck.reasons);
      }

      let pathType: "file" | "directory" | "symlink" | "other" | "nonexistent" = "nonexistent";

      return {
        safe: errors.length === 0 && isWithinWorkspace && !isSensitive,
        resolvedPath: normalizedPath,
        pathType,
        warnings,
        errors,
        isWithinWorkspace,
        isSensitive,
      };
    },
  });

  return [pathSecurityCheckTool];
}