import type { PluginManifest, PluginAuthor, PluginCommandMetadata } from "./types.js";

export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const RESERVED_PLUGIN_NAMES = new Set([
  "builtin",
  "inline",
  "system",
  "core",
]);

const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9\-_]*$/i;

export function validatePluginName(name: string): string | null {
  if (!name || name.trim() === "") {
    return "Plugin name cannot be empty";
  }

  if (name.includes(" ")) {
    return "Plugin name cannot contain spaces. Use kebab-case (e.g., 'my-plugin')";
  }

  if (name.includes("/") || name.includes("\\")) {
    return "Plugin name cannot contain path separators";
  }

  if (name.startsWith(".") || name.includes("..")) {
    return "Plugin name cannot start with '.' or contain '..'";
  }

  if (RESERVED_PLUGIN_NAMES.has(name.toLowerCase())) {
    return `Plugin name '${name}' is reserved`;
  }

  if (!PLUGIN_NAME_PATTERN.test(name)) {
    return "Plugin name must start with a letter or number and contain only letters, numbers, hyphens, and underscores";
  }

  return null;
}

export function validatePluginVersion(version: string | undefined): string | null {
  if (!version) {
    return null;
  }

  const semverPattern = /^v?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;
  if (!semverPattern.test(version)) {
    return `Invalid semantic version: ${version}. Expected format: X.Y.Z (e.g., 1.0.0)`;
  }

  return null;
}

export function validatePluginAuthor(author: PluginAuthor | undefined): string[] {
  const errors: string[] = [];

  if (!author) {
    return errors;
  }

  if (author.name && author.name.trim() === "") {
    errors.push("Author name cannot be empty if provided");
  }

  if (author.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(author.email)) {
    errors.push(`Invalid email format: ${author.email}`);
  }

  if (author.url) {
    try {
      new URL(author.url);
    } catch {
      errors.push(`Invalid URL format: ${author.url}`);
    }
  }

  return errors;
}

export function validatePluginCommandMetadata(
  name: string,
  metadata: PluginCommandMetadata
): string[] {
  const errors: string[] = [];

  if (metadata.source && metadata.content) {
    errors.push(`Command '${name}' cannot have both 'source' and 'content'`);
  }

  if (!metadata.source && !metadata.content) {
    errors.push(`Command '${name}' must have either 'source' or 'content'`);
  }

  return errors;
}

export function validatePluginManifest(
  manifest: unknown,
  options: { strict?: boolean } = {}
): PluginValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const strict = options.strict ?? true;

  if (!manifest || typeof manifest !== "object") {
    return {
      valid: false,
      errors: ["Manifest must be a JSON object"],
      warnings: [],
    };
  }

  const m = manifest as Record<string, unknown>;

  const nameError = validatePluginName(m.name as string);
  if (nameError) {
    errors.push(nameError);
  }

  const versionError = validatePluginVersion(m.version as string);
  if (versionError) {
    if (strict) {
      errors.push(versionError);
    } else {
      warnings.push(versionError);
    }
  }

  const authorErrors = validatePluginAuthor(m.author as PluginAuthor);
  errors.push(...authorErrors);

  if (m.homepage) {
    try {
      new URL(m.homepage as string);
    } catch {
      warnings.push(`Invalid homepage URL: ${m.homepage}`);
    }
  }

  if (m.repository) {
    try {
      new URL(m.repository as string);
    } catch {
      if (typeof m.repository === "string" && !m.repository.startsWith("git@")) {
        warnings.push(`Invalid repository URL: ${m.repository}`);
      }
    }
  }

  if (m.keywords && !Array.isArray(m.keywords)) {
    errors.push("Keywords must be an array");
  }

  if (m.dependencies && !Array.isArray(m.dependencies)) {
    errors.push("Dependencies must be an array of strings");
  }

  if (m.commands && typeof m.commands === "object" && !Array.isArray(m.commands)) {
    const commands = m.commands as Record<string, PluginCommandMetadata>;
    for (const [name, metadata] of Object.entries(commands)) {
      const cmdErrors = validatePluginCommandMetadata(name, metadata);
      errors.push(...cmdErrors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function parsePluginManifest(json: string): PluginManifest | null {
  try {
    const parsed = JSON.parse(json);
    const result = validatePluginManifest(parsed);

    if (!result.valid) {
      console.error("Plugin manifest validation errors:", result.errors);
      return null;
    }

    if (result.warnings.length > 0) {
      console.warn("Plugin manifest validation warnings:", result.warnings);
    }

    return parsed as PluginManifest;
  } catch (error) {
    console.error("Failed to parse plugin manifest:", error);
    return null;
  }
}

export function createDefaultManifest(name: string): PluginManifest {
  return {
    name,
    version: "1.0.0",
    description: `Plugin: ${name}`,
  };
}
