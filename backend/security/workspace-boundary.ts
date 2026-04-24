export interface WorkspaceBoundary {
  root: string;
  allowedPaths: string[];
  deniedPaths: string[];
  allowExternal?: boolean;
}

export interface PathValidationResult {
  valid: boolean;
  reason?: string;
  resolvedPath?: string;
}

export interface WorkspaceConfig {
  boundaries: WorkspaceBoundary;
  checkOnRead?: boolean;
  checkOnWrite?: boolean;
  checkOnExecute?: boolean;
}

const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  boundaries: {
    root: process.cwd(),
    allowedPaths: [],
    deniedPaths: [
      "/.git/",
      "/.ssh/",
      "/.aws/",
      "/etc/passwd",
      "/etc/shadow",
    ],
    allowExternal: false,
  },
  checkOnRead: true,
  checkOnWrite: true,
  checkOnExecute: true,
};

const PROTECTED_PATTERNS = [
  /^\/\.git\//,
  /^\/\.ssh\//,
  /^\/\.aws\//,
  /^\/etc\//,
  /^\/root\//,
  /^\/proc\//,
  /^\/sys\//,
  /\.env$/,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /id_dsa/,
  /id_ecdsa/,
  /credentials/,
];

export class WorkspaceBoundaryValidator {
  private config: WorkspaceConfig;
  private realpathCache = new Map<string, string>();

  constructor(config: WorkspaceConfig = DEFAULT_WORKSPACE_CONFIG) {
    this.config = { ...DEFAULT_WORKSPACE_CONFIG, ...config };
  }

  validatePath(path: string, operation: "read" | "write" | "execute" = "read"): PathValidationResult {
    const shouldCheck = this.shouldCheck(operation);
    if (!shouldCheck) {
      return { valid: true, resolvedPath: path };
    }

    const resolvedPath = this.resolvePath(path);

    if (this.isProtectedPath(resolvedPath)) {
      return {
        valid: false,
        reason: `Protected path: ${resolvedPath}`,
        resolvedPath,
      };
    }

    if (this.isDeniedPath(resolvedPath)) {
      return {
        valid: false,
        reason: `Denied path: ${resolvedPath}`,
        resolvedPath,
      };
    }

    if (!this.isWithinBoundary(resolvedPath)) {
      if (!this.config.boundaries.allowExternal) {
        return {
          valid: false,
          reason: `Path outside workspace boundary: ${resolvedPath}`,
          resolvedPath,
        };
      }
    }

    if (!this.isAllowedPath(resolvedPath)) {
      return {
        valid: false,
        reason: `Path not in allowed list: ${resolvedPath}`,
        resolvedPath,
      };
    }

    return { valid: true, resolvedPath };
  }

  validateBatch(paths: string[], operation: "read" | "write" | "execute" = "read"): Map<string, PathValidationResult> {
    const results = new Map<string, PathValidationResult>();
    for (const path of paths) {
      results.set(path, this.validatePath(path, operation));
    }
    return results;
  }

  isWithinBoundary(path: string): boolean {
    const { root, allowedPaths } = this.config.boundaries;

    if (allowedPaths.length > 0) {
      return allowedPaths.some((allowed) => this.pathMatches(path, allowed));
    }

    return this.pathMatches(path, root);
  }

  isAllowedPath(path: string): boolean {
    const { allowedPaths } = this.config.boundaries;

    if (allowedPaths.length === 0) {
      return true;
    }

    return allowedPaths.some((allowed) => this.pathMatches(path, allowed));
  }

  isDeniedPath(path: string): boolean {
    return this.config.boundaries.deniedPaths.some((denied) =>
      this.pathMatches(path, denied)
    );
  }

  isProtectedPath(path: string): boolean {
    return PROTECTED_PATTERNS.some((pattern) => pattern.test(path));
  }

  private pathMatches(path: string, pattern: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const normalizedPattern = this.normalizePath(pattern);

    if (normalizedPath.startsWith(normalizedPattern)) {
      return true;
    }

    if (normalizedPath.includes(normalizedPattern)) {
      return true;
    }

    return false;
  }

  private normalizePath(path: string): string {
    return path.replace(/\/+/g, "/").replace(/\/$/, "");
  }

  private resolvePath(path: string): string {
    if (this.realpathCache.has(path)) {
      return this.realpathCache.get(path)!;
    }

    let resolved = path;
    if (!path.startsWith("/")) {
      resolved = `${this.config.boundaries.root}/${path}`;
    }

    resolved = this.normalizePath(resolved);

    try {
      const realPath = resolved;
      this.realpathCache.set(path, realPath);
      return realPath;
    } catch {
      return resolved;
    }
  }

  private shouldCheck(operation: "read" | "write" | "execute"): boolean {
    switch (operation) {
      case "read":
        return this.config.checkOnRead ?? true;
      case "write":
        return this.config.checkOnWrite ?? true;
      case "execute":
        return this.config.checkOnExecute ?? true;
      default:
        return true;
    }
  }

  setBoundary(boundary: WorkspaceBoundary): void {
    this.config.boundaries = boundary;
    this.realpathCache.clear();
  }

  getBoundary(): WorkspaceBoundary {
    return { ...this.config.boundaries };
  }

  addAllowedPath(path: string): void {
    if (!this.config.boundaries.allowedPaths.includes(path)) {
      this.config.boundaries.allowedPaths.push(path);
    }
  }

  removeAllowedPath(path: string): void {
    this.config.boundaries.allowedPaths = this.config.boundaries.allowedPaths.filter(
      (p) => p !== path
    );
  }

  addDeniedPath(path: string): void {
    if (!this.config.boundaries.deniedPaths.includes(path)) {
      this.config.boundaries.deniedPaths.push(path);
    }
  }

  removeDeniedPath(path: string): void {
    this.config.boundaries.deniedPaths = this.config.boundaries.deniedPaths.filter(
      (p) => p !== path
    );
  }
}

export function createWorkspaceValidator(root?: string): WorkspaceBoundaryValidator {
  const boundary: WorkspaceBoundary = {
    root: root || process.cwd(),
    allowedPaths: [],
    deniedPaths: [
      "/.git/",
      "/.ssh/",
      "/.aws/",
    ],
    allowExternal: false,
  };

  return new WorkspaceBoundaryValidator({ boundaries: boundary });
}

export function isPathInWorkspace(
  workspaceRoot: string,
  targetPath: string
): boolean {
  const normalizedRoot = workspaceRoot.replace(/\/+$/, "");
  const normalizedTarget = targetPath.replace(/\/+/g, "/");

  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}/`)
  );
}

export function getRelativePath(workspaceRoot: string, targetPath: string): string {
  const normalizedRoot = workspaceRoot.replace(/\/+$/, "");
  const normalizedTarget = targetPath.replace(/\/+/g, "/");

  if (normalizedTarget.startsWith(`${normalizedRoot}/`)) {
    return normalizedTarget.slice(normalizedRoot.length);
  }

  return normalizedTarget;
}
