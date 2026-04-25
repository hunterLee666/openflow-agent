export type FlagValue = boolean | string | number;

export type FlagMap = Record<string, FlagValue>;

export interface FlagDefinition {
  key: string;
  type: "bool" | "enum" | "number";
  default: FlagValue;
  description: string;
  deprecated?: boolean;
}

export interface FlagSource {
  name: string;
  priority: number;
  getFlags(): FlagMap | Promise<FlagMap>;
}

export interface EffectiveFlags {
  values: FlagMap;
  sources: Record<string, string>;
  locked: Set<string>;
}

export function mergeFlags(layers: FlagMap[]): FlagMap {
  const out: FlagMap = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer)) {
      if (v === undefined) continue;
      out[k] = v;
    }
  }
  return out;
}

export function envOverridePrefix(prefix = "OPENFLOW_FLAG_"): FlagMap {
  const out: FlagMap = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith(prefix) || v == null) continue;
    const name = k.slice(prefix.length).replace(/__/g, ".");
    out[name] = parseEnvValue(v);
  }
  return out;
}

export async function mergeFlagSources(
  defaults: FlagMap,
  sources: FlagSource[]
): Promise<EffectiveFlags> {
  const sorted = [...sources].sort((a, b) => a.priority - b.priority);
  const layers: FlagMap[] = [defaults];
  const sourceMap: Record<string, string> = {};
  const locked = new Set<string>();

  for (const source of sorted) {
    const flags = await source.getFlags();
    layers.push(flags);

    for (const key of Object.keys(flags)) {
      sourceMap[key] = source.name;
      if (source.name === "remote" || source.name === "env") {
        locked.add(key);
      }
    }
  }

  const values = mergeFlags(layers);

  return { values, sources: sourceMap, locked };
}

export function hashUserForBucketing(userId: string, salt = ""): number {
  let hash = 0;
  const str = salt + userId;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % 100;
}

export function isInBucket(userId: string, threshold: number, salt?: string): boolean {
  return hashUserForBucketing(userId, salt) < threshold;
}

export function parseEnvValue(v: string): FlagValue {
  if (v === "true" || v === "false") return v === "true";
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}

export function createDefaultFlags(definitions: FlagDefinition[]): FlagMap {
  const out: FlagMap = {};
  for (const def of definitions) {
    out[def.key] = def.default;
  }
  return out;
}

export function validateFlagValue(def: FlagDefinition, value: unknown): boolean {
  if (def.type === "bool") return typeof value === "boolean";
  if (def.type === "number") return typeof value === "number";
  if (def.type === "enum") return typeof value === "string";
  return false;
}

export class FlagRegistry {
  private definitions = new Map<string, FlagDefinition>();
  private defaults: FlagMap = {};

  register(def: FlagDefinition): void {
    this.definitions.set(def.key, def);
    this.defaults[def.key] = def.default;
  }

  getDefinition(key: string): FlagDefinition | undefined {
    return this.definitions.get(key);
  }

  getAllDefinitions(): FlagDefinition[] {
    return Array.from(this.definitions.values());
  }

  getDefaults(): FlagMap {
    return { ...this.defaults };
  }

  getDeprecatedFlags(): string[] {
    const deprecated: string[] = [];
    for (const [key, def] of this.definitions) {
      if (def.deprecated) deprecated.push(key);
    }
    return deprecated;
  }
}

export class RemoteFlagSource implements FlagSource {
  readonly name = "remote";
  readonly priority = 2;

  private cache: FlagMap | null = null;
  private lastFetch = 0;
  private ttlMs: number;

  constructor(
    private url: string,
    ttlMs = 60000
  ) {
    this.ttlMs = ttlMs;
  }

  async getFlags(): Promise<FlagMap> {
    const now = Date.now();
    if (this.cache && now - this.lastFetch < this.ttlMs) {
      return this.cache;
    }

    try {
      const res = await fetch(this.url, { headers: { "cache-control": "no-store" } });
      if (!res.ok) {
        return this.cache ?? {};
      }
      const data = await res.json() as FlagMap;
      this.cache = data;
      this.lastFetch = now;
      return data;
    } catch {
      return this.cache ?? {};
    }
  }

  setCache(flags: FlagMap): void {
    this.cache = flags;
    this.lastFetch = Date.now();
  }
}

export class UserSettingsFlagSource implements FlagSource {
  readonly name = "user";
  readonly priority = 3;

  constructor(private flags: FlagMap) {}

  async getFlags(): Promise<FlagMap> {
    return this.flags;
  }

  update(key: string, value: FlagValue): void {
    this.flags[key] = value;
  }
}

export class EnvFlagSource implements FlagSource {
  readonly name = "env";
  readonly priority = 4;

  constructor(private prefix: string = "OPENFLOW_FLAG_") {}

  async getFlags(): Promise<FlagMap> {
    return envOverridePrefix(this.prefix);
  }
}

export const DEFAULT_FLAG_DEFINITIONS: FlagDefinition[] = [
  {
    key: "tools.mcp.v2Transport",
    type: "bool",
    default: false,
    description: "Enable new MCP transport",
  },
  {
    key: "ui.compactMode",
    type: "bool",
    default: false,
    description: "TUI compact density",
  },
  {
    key: "model.routing.variant",
    type: "enum",
    default: "A",
    description: "Model routing A/B variant",
  },
  {
    key: "telemetry.sampleRate",
    type: "number",
    default: 0.1,
    description: "Telemetry sampling rate",
  },
  {
    key: "mcp.enabled",
    type: "bool",
    default: true,
    description: "Enable MCP integration",
  },
];
