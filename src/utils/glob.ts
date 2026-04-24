export interface GlobMatcherOptions {
  caseSensitive?: boolean;
  debug?: boolean;
}

export class GlobMatcher {
  private patterns: string[];
  private negated: Set<number>;
  private options: GlobMatcherOptions;

  constructor(patterns: string | string[], options: GlobMatcherOptions = {}) {
    this.patterns = Array.isArray(patterns) ? patterns : [patterns];
    this.negated = new Set();
    this.options = { caseSensitive: true, debug: false, ...options };

    this.patterns.forEach((pattern, index) => {
      if (pattern.startsWith("!")) {
        this.negated.add(index);
      }
    });
  }

  matches(path: string): boolean {
    if (this.patterns.length === 0) {
      return false;
    }

    const normalizedPath = this.normalizePath(path);
    let hasInclusion = false;
    const exclusionMatches: Set<number> = new Set();

    for (let i = 0; i < this.patterns.length; i++) {
      const pattern = this.patterns[i];
      const isNegated = this.negated.has(i);

      const processedPattern = this.processPattern(pattern);
      const matched = this.globMatch(normalizedPath, processedPattern);

      if (matched) {
        if (isNegated) {
          exclusionMatches.add(i);
        } else {
          hasInclusion = true;
        }
      }
    }

    if (this.options.debug) {
      console.debug(`GlobMatcher: path=${path}, hasInclusion=${hasInclusion}, exclusions=${Array.from(exclusionMatches)}`);
    }

    return hasInclusion && exclusionMatches.size === 0;
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
  }

  private processPattern(pattern: string): string {
    let processed = pattern;

    if (processed.startsWith("!")) {
      processed = processed.slice(1);
    }

    if (!processed.includes("**") && !processed.endsWith("/")) {
      return processed;
    }

    return processed;
  }

  private globMatch(path: string, pattern: string): boolean {
    const caseSensitive = this.options.caseSensitive ?? true;
    const p = caseSensitive ? pattern : pattern.toLowerCase();
    const s = caseSensitive ? path : path.toLowerCase();

    if (p === "**") return true;

    const parts = p.split("**");
    if (parts.length === 2) {
      const [prefix, suffix] = parts;
      if (prefix && !s.startsWith(prefix)) return false;
      if (suffix && !s.includes(suffix)) return false;
      return true;
    }

    const regex = this.globToRegex(p);
    return regex.test(s);
  }

  private globToRegex(pattern: string): RegExp {
    let regexStr = "";

    let i = 0;
    while (i < pattern.length) {
      const c = pattern[i];

      if (c === "*") {
        if (i + 1 < pattern.length && pattern[i + 1] === "*") {
          if (i + 2 < pattern.length && pattern[i + 2] === "/") {
            regexStr += "(?:.*/)?";
            i += 3;
            continue;
          } else if (i + 2 === pattern.length) {
            regexStr += ".*";
            i += 2;
            continue;
          }
        }
        regexStr += "[^/]*";
        i++;
        continue;
      }

      if (c === "?") {
        regexStr += "[^/]";
        i++;
        continue;
      }

      if (c === "[") {
        const closeBracket = pattern.indexOf("]", i + 1);
        if (closeBracket !== -1) {
          regexStr += pattern.slice(i, closeBracket + 1);
          i = closeBracket + 1;
          continue;
        }
      }

      if (c === "." || c === "+" || c === "^" || c === "$" || c === "(" || c === ")" || c === "|" || c === "\\") {
        regexStr += "\\" + c;
      } else {
        regexStr += c;
      }

      i++;
    }

    return new RegExp(`^${regexStr}$`);
  }

  static fromRuleContent(
    content: { toolName?: string; commandPattern?: string; pathPattern?: string },
    context: { tool: string; input?: Record<string, unknown> }
  ): GlobMatcher | null {
    const patterns: string[] = [];

    if (content.toolName && content.toolName !== context.tool) {
      return null;
    }

    if (content.pathPattern) {
      patterns.push(content.pathPattern);
    }

    if (content.commandPattern && context.tool === "bash") {
      const cmdInput = context.input?.command || context.input?.cmd || "";
      patterns.push(content.commandPattern.replace("*", String(cmdInput)));
    }

    if (patterns.length === 0) {
      return null;
    }

    return new GlobMatcher(patterns);
  }
}

export function matchGlob(pattern: string, path: string): boolean {
  return new GlobMatcher(pattern).matches(path);
}

export function matchAnyGlob(patterns: string[], path: string): boolean {
  if (patterns.length === 0) return false;
  return new GlobMatcher(patterns).matches(path);
}