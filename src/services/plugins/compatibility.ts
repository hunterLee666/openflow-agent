import { satisfies, coerce, valid, compare, major, minor, patch } from 'semver'

export interface PluginManifest {
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
  engines?: {
    openflow?: string
    node?: string
    [key: string]: string | undefined
  }
  peerDependencies?: Record<string, string>
  dependencies?: Record<string, string>
  compatibility?: {
    minVersion?: string
    maxVersion?: string
    features?: string[]
  }
}

export interface CompatibilityResult {
  compatible: boolean
  errors: CompatibilityError[]
  warnings: CompatibilityWarning[]
  pluginName: string
  pluginVersion: string
}

export interface CompatibilityError {
  code: string
  message: string
  field: string
  expected?: string
  actual?: string
}

export interface CompatibilityWarning {
  code: string
  message: string
  field: string
}

export interface HostEnvironment {
  openflowVersion: string
  nodeVersion: string
  features: Set<string>
  installedPlugins: Map<string, string>
}

export class PluginCompatibilityChecker {
  private hostEnvironment: HostEnvironment

  constructor(environment: HostEnvironment) {
    this.hostEnvironment = environment
  }

  check(manifest: PluginManifest): CompatibilityResult {
    const errors: CompatibilityError[] = []
    const warnings: CompatibilityWarning[] = []

    this.checkVersion(manifest, errors)
    this.checkName(manifest, errors)
    this.checkEngines(manifest, errors, warnings)
    this.checkDependencies(manifest, errors, warnings)
    this.checkFeatures(manifest, warnings)
    this.checkConflicts(manifest, warnings)

    return {
      compatible: errors.length === 0,
      errors,
      warnings,
      pluginName: manifest.name,
      pluginVersion: manifest.version,
    }
  }

  private checkVersion(
    manifest: PluginManifest,
    errors: CompatibilityError[],
  ): void {
    if (!manifest.version) {
      errors.push({
        code: 'MISSING_VERSION',
        message: 'Plugin manifest must specify a version',
        field: 'version',
      })
      return
    }

    if (!valid(manifest.version)) {
      errors.push({
        code: 'INVALID_VERSION',
        message: `Invalid semver version: ${manifest.version}`,
        field: 'version',
        actual: manifest.version,
      })
    }
  }

  private checkName(
    manifest: PluginManifest,
    errors: CompatibilityError[],
  ): void {
    if (!manifest.name) {
      errors.push({
        code: 'MISSING_NAME',
        message: 'Plugin manifest must specify a name',
        field: 'name',
      })
      return
    }

    if (!/^[a-z0-9][a-z0-9-_]*$/i.test(manifest.name)) {
      errors.push({
        code: 'INVALID_NAME',
        message:
          'Plugin name must start with alphanumeric and contain only alphanumeric, hyphen, or underscore',
        field: 'name',
        actual: manifest.name,
      })
    }

    if (manifest.name.length > 64) {
      errors.push({
        code: 'NAME_TOO_LONG',
        message: 'Plugin name must be 64 characters or less',
        field: 'name',
        actual: manifest.name,
      })
    }

    const reservedNames = ['core', 'system', 'builtin', 'internal', 'openflow']
    if (reservedNames.includes(manifest.name.toLowerCase())) {
      errors.push({
        code: 'RESERVED_NAME',
        message: `Plugin name "${manifest.name}" is reserved`,
        field: 'name',
        actual: manifest.name,
      })
    }
  }

  private checkEngines(
    manifest: PluginManifest,
    errors: CompatibilityError[],
    warnings: CompatibilityWarning[],
  ): void {
    const engines = manifest.engines

    if (!engines) return

    if (engines.openflow) {
      const hostVersion = this.hostEnvironment.openflowVersion
      if (!satisfies(hostVersion, engines.openflow)) {
        errors.push({
          code: 'OPENFLOW_VERSION_MISMATCH',
          message: `Plugin requires OpenFlow ${engines.openflow}, but host is ${hostVersion}`,
          field: 'engines.openflow',
          expected: engines.openflow,
          actual: hostVersion,
        })
      }
    }

    if (engines.node) {
      const hostNode = this.hostEnvironment.nodeVersion
      if (!satisfies(hostNode, engines.node)) {
        warnings.push({
          code: 'NODE_VERSION_WARNING',
          message: `Plugin recommends Node ${engines.node}, but host is ${hostNode}`,
          field: 'engines.node',
        })
      }
    }
  }

  private checkDependencies(
    manifest: PluginManifest,
    errors: CompatibilityError[],
    warnings: CompatibilityWarning[],
  ): void {
    const peerDeps = manifest.peerDependencies

    if (!peerDeps) return

    for (const [depName, depRange] of Object.entries(peerDeps)) {
      const installedVersion = this.hostEnvironment.installedPlugins.get(depName)

      if (!installedVersion) {
        warnings.push({
          code: 'MISSING_PEER_DEPENDENCY',
          message: `Peer dependency "${depName}" is not installed`,
          field: `peerDependencies.${depName}`,
        })
        continue
      }

      if (!satisfies(installedVersion, depRange)) {
        errors.push({
          code: 'PEER_DEPENDENCY_VERSION_MISMATCH',
          message: `Peer dependency "${depName}" version ${installedVersion} does not satisfy ${depRange}`,
          field: `peerDependencies.${depName}`,
          expected: depRange,
          actual: installedVersion,
        })
      }
    }
  }

  private checkFeatures(
    manifest: PluginManifest,
    warnings: CompatibilityWarning[],
  ): void {
    const requiredFeatures = manifest.compatibility?.features

    if (!requiredFeatures || requiredFeatures.length === 0) return

    for (const feature of requiredFeatures) {
      if (!this.hostEnvironment.features.has(feature)) {
        warnings.push({
          code: 'MISSING_FEATURE',
          message: `Required feature "${feature}" is not available in host`,
          field: 'compatibility.features',
        })
      }
    }
  }

  private checkConflicts(
    manifest: PluginManifest,
    warnings: CompatibilityWarning[],
  ): void {
    const installedVersion = this.hostEnvironment.installedPlugins.get(
      manifest.name,
    )

    if (installedVersion) {
      warnings.push({
        code: 'PLUGIN_ALREADY_INSTALLED',
        message: `Plugin "${manifest.name}" version ${installedVersion} is already installed`,
        field: 'name',
      })
    }
  }

  checkUpgrade(
    currentManifest: PluginManifest,
    newManifest: PluginManifest,
  ): CompatibilityResult {
    const errors: CompatibilityError[] = []
    const warnings: CompatibilityWarning[] = []

    if (currentManifest.name !== newManifest.name) {
      errors.push({
        code: 'NAME_MISMATCH',
        message: 'Cannot upgrade: plugin name changed',
        field: 'name',
        expected: currentManifest.name,
        actual: newManifest.name,
      })
    }

    const currentVersion = valid(currentManifest.version)
    const newVersion = valid(newManifest.version)

    if (currentVersion && newVersion) {
      if (compare(newVersion, currentVersion) <= 0) {
        warnings.push({
          code: 'VERSION_DOWNGRADE',
          message: `Upgrading from ${currentVersion} to ${newVersion} is not an upgrade`,
          field: 'version',
        })
      }

      const currentMajor = major(currentVersion)
      const newMajor = major(newVersion)

      if (newMajor > currentMajor) {
        warnings.push({
          code: 'MAJOR_VERSION_CHANGE',
          message: `Major version change from ${currentVersion} to ${newVersion} may include breaking changes`,
          field: 'version',
        })
      }
    }

    return {
      compatible: errors.length === 0,
      errors,
      warnings,
      pluginName: newManifest.name,
      pluginVersion: newManifest.version,
    }
  }
}

export function getHostEnvironment(): HostEnvironment {
  return {
    openflowVersion: process.env.npm_package_version || '0.0.0',
    nodeVersion: process.versions.node,
    features: new Set([
      'hooks',
      'skills',
      'plugins',
      'mcp',
      'defer_loading',
      'slash_commands',
    ]),
    installedPlugins: new Map(),
  }
}

export function checkPluginCompatibility(
  manifest: PluginManifest,
  environment?: HostEnvironment,
): CompatibilityResult {
  const checker = new PluginCompatibilityChecker(
    environment || getHostEnvironment(),
  )
  return checker.check(manifest)
}

export function isCompatible(manifest: PluginManifest): boolean {
  const result = checkPluginCompatibility(manifest)
  return result.compatible
}
