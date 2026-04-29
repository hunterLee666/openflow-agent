import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import type { JarvisConfig, ChannelConfig, ServerConfig } from './types'

const DEFAULT_CONFIG: JarvisConfig = {
  tickIntervalMs: 60000,
  memoryDir: '',
  maxMemorySize: 10000,
  enableScheduler: true,
  channels: [],
  server: {
    enabled: false,
    port: 3456,
    host: '0.0.0.0',
  },
}

export class JarvisConfigManager {
  private configPath: string
  private config: JarvisConfig

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath()
    this.config = { ...DEFAULT_CONFIG }
    this.load()
  }

  private getDefaultConfigPath(): string {
    const configDir = join(homedir(), '.openflow', 'jarvis')
    return join(configDir, 'jarvis.config.json')
  }

  load(): JarvisConfig {
    try {
      if (existsSync(this.configPath)) {
        const content = readFileSync(this.configPath, 'utf-8')
        const loaded = JSON.parse(content)
        this.config = { ...DEFAULT_CONFIG, ...loaded }
        
        if (!this.config.memoryDir) {
          this.config.memoryDir = join(dirname(this.configPath), 'memory')
        }
      }
    } catch (error) {
      console.error('Failed to load Jarvis config:', error)
    }
    return this.config
  }

  save(): void {
    try {
      const dir = dirname(this.configPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to save Jarvis config:', error)
      throw error
    }
  }

  getConfig(): JarvisConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<JarvisConfig>): void {
    this.config = { ...this.config, ...updates }
    this.save()
  }

  addChannel(channel: ChannelConfig): void {
    const existing = this.config.channels.findIndex(c => c.type === channel.type)
    if (existing >= 0) {
      this.config.channels[existing] = channel
    } else {
      this.config.channels.push(channel)
    }
    this.save()
  }

  removeChannel(type: string): void {
    this.config.channels = this.config.channels.filter(c => c.type !== type)
    this.save()
  }

  enableChannel(type: string): void {
    const channel = this.config.channels.find(c => c.type === type)
    if (channel) {
      channel.enabled = true
      this.save()
    }
  }

  disableChannel(type: string): void {
    const channel = this.config.channels.find(c => c.type === type)
    if (channel) {
      channel.enabled = false
      this.save()
    }
  }

  getChannel(type: string): ChannelConfig | undefined {
    return this.config.channels.find(c => c.type === type)
  }

  listChannels(): ChannelConfig[] {
    return [...this.config.channels]
  }

  setServerConfig(server: Partial<ServerConfig>): void {
    this.config.server = { ...this.config.server, ...server }
    this.save()
  }

  getServerConfig(): ServerConfig {
    return this.config.server || DEFAULT_CONFIG.server!
  }

  getConfigPath(): string {
    return this.configPath
  }

  reset(): void {
    this.config = { ...DEFAULT_CONFIG }
    this.save()
  }
}
