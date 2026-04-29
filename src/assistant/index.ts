import type { JarvisConfig, JarvisAgent, JarvisHooks, JarvisState, ServerConfig, ChannelConfig } from './types'
import { JarvisMemory } from './memory'
import { JarvisScheduler } from './scheduler'
import { JarvisChannel } from './channel'
import { JarvisTickLoop } from './tick-loop'
import { JarvisConfigManager } from './config'
import { JarvisServer } from './server'
import { AutoDream, type DreamConfig, type DreamResult } from './auto-dream'

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

export class Jarvis {
  private config: JarvisConfig
  private configManager: JarvisConfigManager | null = null
  private memory: JarvisMemory
  private scheduler: JarvisScheduler
  private channel: JarvisChannel
  private tickLoop: JarvisTickLoop
  private server: JarvisServer | null = null
  private autoDream: AutoDream
  private agent: JarvisAgent | null = null

  constructor(config: Partial<JarvisConfig> = {}, useConfigFile: boolean = false, configPath?: string) {
    if (useConfigFile) {
      this.configManager = new JarvisConfigManager(configPath)
      this.config = { ...DEFAULT_CONFIG, ...this.configManager.getConfig(), ...config }
    } else {
      this.config = { ...DEFAULT_CONFIG, ...config }
    }

    this.memory = new JarvisMemory(this.config.memoryDir, this.config.maxMemorySize)
    this.scheduler = new JarvisScheduler()
    this.channel = new JarvisChannel()
    this.tickLoop = new JarvisTickLoop(
      this.memory,
      this.scheduler,
      this.channel,
      this.config.tickIntervalMs,
    )

    if (this.config.server?.enabled) {
      this.server = new JarvisServer(this.config.server, this.channel)
    }

    this.autoDream = new AutoDream(this.memory)

    this.setupChannels()
  }

  static fromConfigFile(configPath?: string): Jarvis {
    return new Jarvis({}, true, configPath)
  }

  private setupChannels(): void {
    for (const channelConfig of this.config.channels) {
      this.channel.registerChannel(channelConfig)
    }
  }

  async initialize(agent: JarvisAgent): Promise<void> {
    this.agent = agent
    this.tickLoop.setHooks(agent.hooks)

    if (agent.identity) {
      await this.memory.setIdentity(agent.identity)
    }
    if (agent.soul) {
      await this.memory.setSoul(agent.soul)
    }

    this.channel.onMessage(async message => {
      if (agent.hooks.onMessage) {
        await agent.hooks.onMessage(message)
      }
      await this.memory.append({
        type: 'observation',
        content: `Received message from ${message.channel}: ${message.content}`,
        metadata: { messageId: message.id, sender: message.sender },
      })
    })

    if (this.server) {
      this.server.onCallback('*', async message => {
        if (agent.hooks.onMessage) {
          await agent.hooks.onMessage(message)
        }
      })
    }

    this.autoDream.incrementSessionCount()

    await this.memory.append({
      type: 'action',
      content: `Jarvis initialized with agent: ${agent.name}`,
      metadata: { agentId: agent.id, capabilities: agent.capabilities },
    })
  }

  async start(): Promise<void> {
    if (!this.agent) {
      throw new Error('Jarvis must be initialized with an agent before starting')
    }
    
    if (this.server) {
      await this.server.start()
    }
    
    await this.tickLoop.start()

    this.scheduleAutoDream()
  }

  async pause(): Promise<void> {
    await this.tickLoop.pause()
  }

  async resume(): Promise<void> {
    await this.tickLoop.resume()
  }

  async stop(): Promise<void> {
    await this.tickLoop.stop()
    
    if (this.server) {
      await this.server.stop()
    }
  }

  getState(): JarvisState {
    return this.tickLoop.getState()
  }

  getMemory(): JarvisMemory {
    return this.memory
  }

  getScheduler(): JarvisScheduler {
    return this.scheduler
  }

  getChannel(): JarvisChannel {
    return this.channel
  }

  getTickLoop(): JarvisTickLoop {
    return this.tickLoop
  }

  getServer(): JarvisServer | null {
    return this.server
  }

  getAutoDream(): AutoDream {
    return this.autoDream
  }

  getAgent(): JarvisAgent | null {
    return this.agent
  }

  getConfig(): JarvisConfig {
    return { ...this.config }
  }

  getConfigManager(): JarvisConfigManager | null {
    return this.configManager
  }

  async think(content: string): Promise<void> {
    await this.memory.append({ type: 'thought', content })
  }

  async act(content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.memory.append({ type: 'action', content, metadata })
  }

  async observe(content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.memory.append({ type: 'observation', content, metadata })
  }

  async reflect(content: string): Promise<void> {
    await this.memory.append({ type: 'reflection', content })
  }

  scheduleTask(
    name: string,
    cronExpression: string,
    handler: () => Promise<void>,
  ): void {
    this.scheduler.registerTask(name, cronExpression, handler)
  }

  async sendMessage(channel: string, content: string): Promise<void> {
    await this.channel.sendMessage(channel, content)
  }

  async compact(): Promise<void> {
    await this.memory.compact()
  }

  addChannel(channel: ChannelConfig): void {
    this.config.channels.push(channel)
    this.channel.registerChannel(channel)
    
    if (this.configManager) {
      this.configManager.addChannel(channel)
    }
  }

  removeChannel(type: string): void {
    this.config.channels = this.config.channels.filter(c => c.type !== type)
    this.channel.removeChannel(type)
    
    if (this.configManager) {
      this.configManager.removeChannel(type)
    }
  }

  enableChannel(type: string): void {
    const channel = this.config.channels.find(c => c.type === type)
    if (channel) {
      channel.enabled = true
      if (this.configManager) {
        this.configManager.enableChannel(type)
      }
    }
  }

  disableChannel(type: string): void {
    const channel = this.config.channels.find(c => c.type === type)
    if (channel) {
      channel.enabled = false
      if (this.configManager) {
        this.configManager.disableChannel(type)
      }
    }
  }

  setServerConfig(server: Partial<ServerConfig>): void {
    if (!this.config.server) {
      this.config.server = {
        enabled: false,
        port: 3456,
        host: '0.0.0.0',
      }
    }
    this.config.server = { ...this.config.server, ...server }
    
    if (this.configManager) {
      this.configManager.setServerConfig(server)
    }
  }

  private scheduleAutoDream(): void {
    this.scheduler.registerTask('auto-dream', '0 4 * * *', async () => {
      const status = this.autoDream.getStatus()
      if (status.canDream) {
        console.log('[Jarvis] Starting AutoDream...')
        try {
          const results = await this.autoDream.dream()
          for (const result of results) {
            console.log(`[Jarvis] Dream phase ${result.phase}: ${result.changes.length} changes`)
          }
          console.log('[Jarvis] AutoDream completed')
        } catch (error) {
          console.error('[Jarvis] AutoDream failed:', error)
        }
      }
    })
  }

  async dream(): Promise<DreamResult[]> {
    return await this.autoDream.dream()
  }

  canDream(): { allowed: boolean; reason: string } {
    return this.autoDream.canDream()
  }

  getDreamStatus(): {
    canDream: boolean
    reason: string
    lastDream: Date | null
    sessionCount: number
    hoursSinceLastDream: number
  } {
    return this.autoDream.getStatus()
  }

  registerTranscript(sessionId: string, content: string): void {
    this.autoDream.registerTranscript(sessionId, content)
  }

  destroy(): void {
    this.scheduler.destroy()
    this.channel.destroy()
    
    if (this.server) {
      this.server.destroy()
    }
  }
}

export type {
  JarvisConfig,
  JarvisAgent,
  JarvisState,
  JarvisHooks,
  JarvisEvent,
  JarvisEventHandler,
  MemoryEntry,
  ScheduledTask,
  ChannelMessage,
  ChannelConfig,
  TickContext,
  ServerConfig,
  DreamConfig,
  DreamPhase,
  DreamResult,
} from './types'

export { JarvisMemory } from './memory'
export { JarvisScheduler } from './scheduler'
export { JarvisChannel } from './channel'
export { JarvisTickLoop } from './tick-loop'
export { JarvisConfigManager } from './config'
export { JarvisServer } from './server'
export { AutoDream } from './auto-dream'
