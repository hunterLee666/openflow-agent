export interface PreapprovedCommand {
  id: string
  command: string
  type: 'exact' | 'prefix' | 'pattern'
  hash?: string
  description?: string
  createdAt: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export interface PreapprovedCommandConfig {
  enabled: boolean
  enforceHashCheck: boolean
  enforceExpiration: boolean
  allowPrefixMatch: boolean
  allowPatternMatch: boolean
  maxCommands: number
}

export const DEFAULT_PREAPPROVED_CONFIG: PreapprovedCommandConfig = {
  enabled: true,
  enforceHashCheck: false,
  enforceExpiration: true,
  allowPrefixMatch: true,
  allowPatternMatch: false,
  maxCommands: 100,
}

export class PreapprovedCommandManager {
  private config: PreapprovedCommandConfig
  private commands: Map<string, PreapprovedCommand> = new Map()

  constructor(config: Partial<PreapprovedCommandConfig> = {}) {
    this.config = { ...DEFAULT_PREAPPROVED_CONFIG, ...config }
  }

  addCommand(command: Omit<PreapprovedCommand, 'id' | 'createdAt'>): string {
    if (this.commands.size >= this.config.maxCommands) {
      throw new Error('Maximum number of preapproved commands reached')
    }

    const id = this.generateId()
    const fullCommand: PreapprovedCommand = {
      ...command,
      id,
      createdAt: new Date().toISOString(),
    }

    this.commands.set(id, fullCommand)
    return id
  }

  removeCommand(id: string): boolean {
    return this.commands.delete(id)
  }

  getCommand(id: string): PreapprovedCommand | undefined {
    return this.commands.get(id)
  }

  getAllCommands(): PreapprovedCommand[] {
    return Array.from(this.commands.values())
  }

  isPreapproved(command: string): {
    preapproved: boolean
    matchedCommand?: PreapprovedCommand
    reason: string
  } {
    if (!this.config.enabled) {
      return {
        preapproved: false,
        reason: 'Preapproved commands are disabled',
      }
    }

    const trimmed = command.trim()

    for (const preapproved of this.commands.values()) {
      if (this.config.enforceExpiration && preapproved.expiresAt) {
        if (new Date(preapproved.expiresAt) < new Date()) {
          continue
        }
      }

      if (preapproved.type === 'exact') {
        if (trimmed === preapproved.command) {
          if (this.config.enforceHashCheck && preapproved.hash) {
            const hash = this.calculateHash(trimmed)
            if (hash !== preapproved.hash) {
              continue
            }
          }

          return {
            preapproved: true,
            matchedCommand: preapproved,
            reason: 'Exact match',
          }
        }
      }

      if (this.config.allowPrefixMatch && preapproved.type === 'prefix') {
        if (trimmed.startsWith(preapproved.command)) {
          return {
            preapproved: true,
            matchedCommand: preapproved,
            reason: 'Prefix match',
          }
        }
      }

      if (this.config.allowPatternMatch && preapproved.type === 'pattern') {
        try {
          const regex = new RegExp(preapproved.command)
          if (regex.test(trimmed)) {
            return {
              preapproved: true,
              matchedCommand: preapproved,
              reason: 'Pattern match',
            }
          }
        } catch {
          continue
        }
      }
    }

    return {
      preapproved: false,
      reason: 'No matching preapproved command found',
    }
  }

  addExactCommand(
    command: string,
    description?: string,
    expiresAt?: string,
  ): string {
    return this.addCommand({
      command,
      type: 'exact',
      hash: this.config.enforceHashCheck ? this.calculateHash(command) : undefined,
      description,
      expiresAt,
    })
  }

  addPrefixCommand(
    prefix: string,
    description?: string,
    expiresAt?: string,
  ): string {
    return this.addCommand({
      command: prefix,
      type: 'prefix',
      description,
      expiresAt,
    })
  }

  addPatternCommand(
    pattern: string,
    description?: string,
    expiresAt?: string,
  ): string {
    return this.addCommand({
      command: pattern,
      type: 'pattern',
      description,
      expiresAt,
    })
  }

  clearExpiredCommands(): number {
    if (!this.config.enforceExpiration) {
      return 0
    }

    const now = new Date()
    let removed = 0

    for (const [id, command] of this.commands.entries()) {
      if (command.expiresAt && new Date(command.expiresAt) < now) {
        this.commands.delete(id)
        removed++
      }
    }

    return removed
  }

  validateCommand(command: PreapprovedCommand): {
    valid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    if (!command.command || command.command.trim() === '') {
      errors.push('Command is required')
    }

    if (!['exact', 'prefix', 'pattern'].includes(command.type)) {
      errors.push(`Invalid type: ${command.type}`)
    }

    if (command.type === 'pattern') {
      try {
        new RegExp(command.command)
      } catch (error) {
        errors.push(`Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    if (command.type === 'exact' && command.command.includes('&&')) {
      warnings.push('Exact command contains && which may be a compound command')
    }

    if (command.type === 'exact' && command.command.includes('||')) {
      warnings.push('Exact command contains || which may be a compound command')
    }

    if (command.type === 'prefix' && command.command.length < 5) {
      warnings.push('Prefix is very short and may match too many commands')
    }

    if (command.expiresAt && new Date(command.expiresAt) < new Date()) {
      warnings.push('Expiration date is in the past')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  export(): PreapprovedCommand[] {
    return this.getAllCommands()
  }

  import(commands: PreapprovedCommand[]): void {
    for (const command of commands) {
      this.commands.set(command.id, command)
    }
  }

  private generateId(): string {
    return `preapproved-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private calculateHash(command: string): string {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(command).digest('hex')
  }

  updateConfig(updates: Partial<PreapprovedCommandConfig>): void {
    this.config = { ...this.config, ...updates }
  }

  getConfig(): PreapprovedCommandConfig {
    return { ...this.config }
  }
}

export const COMMON_SAFE_COMMANDS = [
  { command: 'git status', type: 'exact' as const, description: 'Git status check' },
  { command: 'git diff', type: 'prefix' as const, description: 'Git diff operations' },
  { command: 'npm test', type: 'exact' as const, description: 'Run npm tests' },
  { command: 'npm run lint', type: 'exact' as const, description: 'Run linter' },
  { command: 'npm run build', type: 'exact' as const, description: 'Build project' },
  { command: 'pnpm test', type: 'exact' as const, description: 'Run pnpm tests' },
  { command: 'pnpm lint', type: 'exact' as const, description: 'Run pnpm linter' },
  { command: 'ls', type: 'prefix' as const, description: 'List files' },
  { command: 'cat', type: 'prefix' as const, description: 'Read file contents' },
  { command: 'echo', type: 'prefix' as const, description: 'Echo output' },
]
