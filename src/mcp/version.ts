export interface ProtocolVersion {
  major: number;
  minor: number;
  patch?: number;
}

export interface VersionRange {
  min: ProtocolVersion;
  max: ProtocolVersion;
  compatible: ProtocolVersion[];
}

export interface NegotiationResult {
  agreedVersion: ProtocolVersion | null;
  clientVersion: ProtocolVersion;
  serverVersion: ProtocolVersion;
  status: "success" | "fallback" | "failed";
  fallbackReason?: string;
  negotiatedCapabilities?: CapabilitySet;
}

export interface CapabilitySet {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  logging?: boolean;
  sampling?: boolean;
  roots?: boolean;
}

export const SUPPORTED_VERSIONS: ProtocolVersion[] = [
  { major: 1, minor: 0, patch: 0 },
  { major: 1, minor: 1, patch: 0 },
  { major: 1, minor: 2, patch: 0 },
];

export const VERSION_COMPATIBILITY: Record<string, string[]> = {
  "1.0.0": ["1.0.0", "1.1.0"],
  "1.1.0": ["1.0.0", "1.1.0", "1.2.0"],
  "1.2.0": ["1.1.0", "1.2.0"],
};

export const MINIMUM_VERSION: ProtocolVersion = { major: 1, minor: 0, patch: 0 };
export const CURRENT_VERSION: ProtocolVersion = { major: 1, minor: 2, patch: 0 };

export class ProtocolVersionManager {
  private supportedVersions: ProtocolVersion[];
  private currentVersion: ProtocolVersion;
  private versionCache: Map<string, ProtocolVersion> = new Map();

  constructor(
    supportedVersions: ProtocolVersion[] = SUPPORTED_VERSIONS,
    currentVersion: ProtocolVersion = CURRENT_VERSION
  ) {
    this.supportedVersions = supportedVersions.sort((a, b) => this.compare(a, b));
    this.currentVersion = currentVersion;
  }

  parseVersion(versionStr: string): ProtocolVersion | null {
    if (this.versionCache.has(versionStr)) {
      return this.versionCache.get(versionStr)!;
    }

    const match = versionStr.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
    if (!match) {
      return null;
    }

    const version: ProtocolVersion = {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: match[3] ? parseInt(match[3], 10) : undefined,
    };

    this.versionCache.set(versionStr, version);
    return version;
  }

  formatVersion(version: ProtocolVersion): string {
    if (version.patch !== undefined) {
      return `${version.major}.${version.minor}.${version.patch}`;
    }
    return `${version.major}.${version.minor}`;
  }

  compare(a: ProtocolVersion, b: ProtocolVersion): number {
    if (a.major !== b.major) {
      return a.major - b.major;
    }
    if (a.minor !== b.minor) {
      return a.minor - b.minor;
    }
    if (a.patch !== undefined && b.patch !== undefined) {
      return a.patch - b.patch;
    }
    if (a.patch !== undefined) {
      return 1;
    }
    if (b.patch !== undefined) {
      return -1;
    }
    return 0;
  }

  isCompatible(version: ProtocolVersion): boolean {
    return (
      this.compare(version, MINIMUM_VERSION) >= 0 &&
      this.supportedVersions.some((v) => this.compare(v, version) === 0)
    );
  }

  getCompatibleVersion(serverVersion: ProtocolVersion): ProtocolVersion | null {
    for (const supported of this.supportedVersions) {
      if (this.compare(supported, serverVersion) === 0) {
        return supported;
      }
    }

    const compatibleList = VERSION_COMPATIBILITY[this.formatVersion(serverVersion)];
    if (compatibleList) {
      for (const compat of compatibleList) {
        const parsed = this.parseVersion(compat);
        if (parsed && this.isCompatible(parsed)) {
          return parsed;
        }
      }
    }

    const fallback = this.findBestFallback(serverVersion);
    return fallback;
  }

  private findBestFallback(serverVersion: ProtocolVersion): ProtocolVersion | null {
    let bestFallback: ProtocolVersion | null = null;

    for (const supported of this.supportedVersions) {
      if (this.compare(supported, serverVersion) <= 0) {
        if (!bestFallback || this.compare(supported, bestFallback) > 0) {
          bestFallback = supported;
        }
      }
    }

    return bestFallback;
  }

  negotiate(
    clientVersion: ProtocolVersion,
    serverVersion: ProtocolVersion
  ): NegotiationResult {
    if (!this.isCompatible(clientVersion)) {
      return {
        agreedVersion: null,
        clientVersion,
        serverVersion,
        status: "failed",
        fallbackReason: "Client version not supported",
      };
    }

    if (this.compare(clientVersion, serverVersion) === 0) {
      return {
        agreedVersion: clientVersion,
        clientVersion,
        serverVersion,
        status: "success",
        negotiatedCapabilities: this.getCapabilitiesForVersion(clientVersion),
      };
    }

    const compatible = this.getCompatibleVersion(serverVersion);

    if (!compatible) {
      return {
        agreedVersion: null,
        clientVersion,
        serverVersion,
        status: "failed",
        fallbackReason: "No compatible version found",
      };
    }

    return {
      agreedVersion: compatible,
      clientVersion,
      serverVersion,
      status: this.compare(compatible, clientVersion) === 0 ? "success" : "fallback",
      fallbackReason:
        this.compare(compatible, clientVersion) !== 0
          ? `Client downgraded from ${this.formatVersion(clientVersion)} to ${this.formatVersion(compatible)}`
          : undefined,
      negotiatedCapabilities: this.getCapabilitiesForVersion(compatible),
    };
  }

  private getCapabilitiesForVersion(version: ProtocolVersion): CapabilitySet {
    const baseCapabilities: CapabilitySet = {
      tools: true,
      resources: true,
      prompts: true,
      logging: true,
    };

    if (this.compare(version, { major: 1, minor: 1, patch: 0 }) >= 0) {
      baseCapabilities.sampling = true;
    }

    if (this.compare(version, { major: 1, minor: 2, patch: 0 }) >= 0) {
      baseCapabilities.roots = true;
    }

    return baseCapabilities;
  }

  getCurrentVersion(): ProtocolVersion {
    return { ...this.currentVersion };
  }

  getSupportedVersions(): ProtocolVersion[] {
    return [...this.supportedVersions];
  }

  getMinimumVersion(): ProtocolVersion {
    return { ...MINIMUM_VERSION };
  }
}

export class CapabilityNegotiator {
  private requiredCapabilities: Set<string> = new Set();
  private optionalCapabilities: Set<string> = new Set();

  require(capability: string): void {
    this.requiredCapabilities.add(capability);
  }

  optionally(capability: string): void {
    this.optionalCapabilities.add(capability);
  }

  removeRequirement(capability: string): void {
    this.requiredCapabilities.delete(capability);
  }

  removeOptional(capability: string): void {
    this.optionalCapabilities.delete(capability);
  }

  negotiate(
    clientCapabilities: Record<string, unknown>,
    serverCapabilities: Record<string, unknown>
  ): {
    agreed: string[];
    missing: string[];
    unsupported: string[];
    degraded: string[];
  } {
    const agreed: string[] = [];
    const missing: string[] = [];
    const unsupported: string[] = [];
    const degraded: string[] = [];

    for (const capability of this.requiredCapabilities) {
      if (this.capabilitySupported(capability, serverCapabilities)) {
        agreed.push(capability);
      } else if (this.capabilityAvailable(capability, clientCapabilities)) {
        missing.push(capability);
      } else {
        unsupported.push(capability);
      }
    }

    for (const capability of this.optionalCapabilities) {
      if (this.capabilitySupported(capability, serverCapabilities)) {
        agreed.push(capability);
      } else if (this.capabilityDegraded(capability, clientCapabilities, serverCapabilities)) {
        degraded.push(capability);
      }
    }

    return { agreed, missing, unsupported, degraded };
  }

  private capabilitySupported(capability: string, capabilities: Record<string, unknown>): boolean {
    const parts = capability.split(".");
    let current: unknown = capabilities;

    for (const part of parts) {
      if (typeof current !== "object" || current === null) {
        return false;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current !== undefined && current !== null;
  }

  private capabilityAvailable(capability: string, capabilities: Record<string, unknown>): boolean {
    return this.capabilitySupported(capability, capabilities);
  }

  private capabilityDegraded(
    capability: string,
    clientCapabilities: Record<string, unknown>,
    serverCapabilities: Record<string, unknown>
  ): boolean {
    const clientLevel = this.getCapabilityLevel(capability, clientCapabilities);
    const serverLevel = this.getCapabilityLevel(capability, serverCapabilities);

    return clientLevel !== null && serverLevel !== null && clientLevel > serverLevel;
  }

  private getCapabilityLevel(capability: string, capabilities: Record<string, unknown>): number | null {
    const parts = capability.split(".");
    let current: unknown = capabilities;

    for (const part of parts) {
      if (typeof current !== "object" || current === null) {
        return null;
      }
      current = (current as Record<string, unknown>)[part];
    }

    if (current === true) return 1;
    if (current === false) return 0;
    if (typeof current === "object") return 1;
    return null;
  }

  getRequiredCapabilities(): string[] {
    return Array.from(this.requiredCapabilities);
  }

  getOptionalCapabilities(): string[] {
    return Array.from(this.optionalCapabilities);
  }

  getAllCapabilities(): string[] {
    return [...this.getRequiredCapabilities(), ...this.getOptionalCapabilities()];
  }
}

export const defaultVersionManager = new ProtocolVersionManager();
export const defaultCapabilityNegotiator = new CapabilityNegotiator();
