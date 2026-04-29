import type { JarvisState, TickContext, JarvisHooks, JarvisEventHandler, JarvisEvent } from './types'
import { JarvisMemory } from './memory'
import { JarvisScheduler } from './scheduler'
import { JarvisChannel } from './channel'

export class JarvisTickLoop {
  private state: JarvisState = 'idle'
  private tickNumber: number = 0
  private tickIntervalMs: number
  private intervalId: ReturnType<typeof setInterval> | null = null
  private memory: JarvisMemory
  private scheduler: JarvisScheduler
  private channel: JarvisChannel
  private hooks: JarvisHooks = {}
  private eventHandlers: JarvisEventHandler[] = []
  private startTime: Date | null = null

  constructor(
    memory: JarvisMemory,
    scheduler: JarvisScheduler,
    channel: JarvisChannel,
    tickIntervalMs: number = 60000,
  ) {
    this.tickIntervalMs = tickIntervalMs
    this.memory = memory
    this.scheduler = scheduler
    this.channel = channel
  }

  setHooks(hooks: JarvisHooks): void {
    this.hooks = hooks
  }

  onEvent(handler: JarvisEventHandler): () => void {
    this.eventHandlers.push(handler)
    return () => {
      const index = this.eventHandlers.indexOf(handler)
      if (index > -1) {
        this.eventHandlers.splice(index, 1)
      }
    }
  }

  private async emit(event: JarvisEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event)
      } catch (error) {
        console.error('Event handler failed:', error)
      }
    }
  }

  private async tick(): Promise<void> {
    if (this.state !== 'running') return

    this.tickNumber++
    const tickStart = new Date()

    const context: TickContext = {
      tickNumber: this.tickNumber,
      startTime: tickStart,
      state: this.state,
      recentMemories: await this.memory.getRecent(50),
      pendingTasks: this.scheduler.getPendingTasks(),
      messages: this.channel.getPendingMessages(20),
    }

    await this.emit({ type: 'tick', context })

    if (this.hooks.onTick) {
      try {
        await this.hooks.onTick(context)
      } catch (error) {
        console.error('Tick hook failed:', error)
      }
    }

    await this.memory.append({
      type: 'thought',
      content: `Tick #${this.tickNumber} completed at ${tickStart.toISOString()}`,
    })
  }

  async start(): Promise<void> {
    if (this.state === 'running') return

    const previousState = this.state
    this.state = 'running'
    this.startTime = new Date()

    await this.emit({ type: 'state_change', from: previousState, to: 'running' })

    if (this.hooks.onStateChange) {
      await this.hooks.onStateChange(previousState, 'running')
    }

    await this.memory.append({
      type: 'action',
      content: 'Jarvis daemon started',
    })

    await this.tick()

    this.intervalId = setInterval(() => {
      this.tick().catch(console.error)
    }, this.tickIntervalMs)
  }

  async pause(): Promise<void> {
    if (this.state !== 'running') return

    const previousState = this.state
    this.state = 'paused'

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    await this.emit({ type: 'state_change', from: previousState, to: 'paused' })

    if (this.hooks.onStateChange) {
      await this.hooks.onStateChange(previousState, 'paused')
    }

    await this.memory.append({
      type: 'action',
      content: 'Jarvis daemon paused',
    })
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused') return
    await this.start()
  }

  async stop(): Promise<void> {
    const previousState = this.state
    this.state = 'stopped'

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    await this.emit({ type: 'state_change', from: previousState, to: 'stopped' })

    if (this.hooks.onStateChange) {
      await this.hooks.onStateChange(previousState, 'stopped')
    }

    await this.memory.append({
      type: 'action',
      content: 'Jarvis daemon stopped',
    })

    this.tickNumber = 0
    this.startTime = null
  }

  getState(): JarvisState {
    return this.state
  }

  getTickNumber(): number {
    return this.tickNumber
  }

  getUptime(): number {
    if (!this.startTime) return 0
    return Date.now() - this.startTime.getTime()
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
}
