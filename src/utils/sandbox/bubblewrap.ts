export interface BubblewrapConfig {
  enabled: boolean
  unsharePid: boolean
  unshareNet: boolean
  unshareIpc: boolean
  unshareUts: boolean
  unshareCgroup: boolean
  dieWithParent: boolean
  newSession: boolean
  clearenv: boolean
  bindPaths: BindPath[]
  roBindPaths: string[]
  devBindPaths: string[]
  tmpfsPaths: string[]
  setEnv: Record<string, string>
  chdir?: string
  hostname?: string
}

export interface BindPath {
  source: string
  dest: string
  readonly: boolean
}

export const DEFAULT_BUBBLEWRAP_CONFIG: BubblewrapConfig = {
  enabled: true,
  unsharePid: true,
  unshareNet: false,
  unshareIpc: true,
  unshareUts: true,
  unshareCgroup: false,
  dieWithParent: true,
  newSession: true,
  clearenv: false,
  bindPaths: [],
  roBindPaths: [],
  devBindPaths: ['/dev/null', '/dev/zero', '/dev/random', '/dev/urandom'],
  tmpfsPaths: ['/tmp'],
  setEnv: {},
}

export class BubblewrapBuilder {
  private config: BubblewrapConfig

  constructor(config: Partial<BubblewrapConfig> = {}) {
    this.config = { ...DEFAULT_BUBBLEWRAP_CONFIG, ...config }
  }

  buildCommand(command: string): string[] {
    const args: string[] = ['bwrap']

    if (this.config.unsharePid) {
      args.push('--unshare-pid')
    }

    if (this.config.unshareNet) {
      args.push('--unshare-net')
    }

    if (this.config.unshareIpc) {
      args.push('--unshare-ipc')
    }

    if (this.config.unshareUts) {
      args.push('--unshare-uts')
    }

    if (this.config.unshareCgroup) {
      args.push('--unshare-cgroup')
    }

    if (this.config.dieWithParent) {
      args.push('--die-with-parent')
    }

    if (this.config.newSession) {
      args.push('--new-session')
    }

    if (this.config.clearenv) {
      args.push('--clearenv')
    }

    for (const path of this.config.roBindPaths) {
      args.push('--ro-bind', path, path)
    }

    for (const bind of this.config.bindPaths) {
      if (bind.readonly) {
        args.push('--ro-bind', bind.source, bind.dest)
      } else {
        args.push('--bind', bind.source, bind.dest)
      }
    }

    for (const path of this.config.devBindPaths) {
      args.push('--dev-bind', path, path)
    }

    for (const path of this.config.tmpfsPaths) {
      args.push('--tmpfs', path)
    }

    for (const [key, value] of Object.entries(this.config.setEnv)) {
      args.push('--setenv', key, value)
    }

    if (this.config.chdir) {
      args.push('--chdir', this.config.chdir)
    }

    if (this.config.hostname) {
      args.push('--hostname', this.config.hostname)
    }

    args.push('--', 'sh', '-c', command)

    return args
  }

  createProjectSandbox(projectDir: string, homeDir: string): BubblewrapBuilder {
    const builder = new BubblewrapBuilder(this.config)

    builder.config.roBindPaths = [
      '/usr',
      '/lib',
      '/lib64',
      '/bin',
      '/etc',
      homeDir,
    ]

    builder.config.bindPaths = [
      { source: projectDir, dest: projectDir, readonly: false },
    ]

    builder.config.chdir = projectDir

    return builder
  }

  createMinimalSandbox(): BubblewrapBuilder {
    const builder = new BubblewrapBuilder({
      ...this.config,
      unsharePid: true,
      unshareNet: true,
      unshareIpc: true,
      unshareUts: true,
      dieWithParent: true,
      newSession: true,
      clearenv: true,
    })

    builder.config.devBindPaths = ['/dev/null', '/dev/zero', '/dev/random', '/dev/urandom']
    builder.config.tmpfsPaths = ['/tmp', '/run']

    return builder
  }

  createNetworkIsolatedSandbox(): BubblewrapBuilder {
    const builder = this.createMinimalSandbox()
    builder.config.unshareNet = true
    return builder
  }

  addBindPath(source: string, dest: string, readonly: boolean = false): void {
    this.config.bindPaths.push({ source, dest, readonly })
  }

  addRoBindPath(path: string): void {
    this.config.roBindPaths.push(path)
  }

  addDevBindPath(path: string): void {
    this.config.devBindPaths.push(path)
  }

  addTmpfsPath(path: string): void {
    this.config.tmpfsPaths.push(path)
  }

  setEnvVar(key: string, value: string): void {
    this.config.setEnv[key] = value
  }

  updateConfig(updates: Partial<BubblewrapConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  getConfig(): BubblewrapConfig {
    return { ...this.config }
  }
}

export function checkBubblewrapAvailable(): boolean {
  try {
    const { execSync } = require('child_process')
    execSync('which bwrap', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function getBubblewrapVersion(): string | null {
  try {
    const { execSync } = require('child_process')
    const output = execSync('bwrap --version', { encoding: 'utf-8' })
    return output.trim()
  } catch {
    return null
  }
}
