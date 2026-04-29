export type JarvisState = 'idle' | 'running' | 'paused' | 'stopped'

export type ServerConfig = {
  enabled: boolean
  port: number
  host: string
  path?: string
}

export type JarvisConfig = {
  tickIntervalMs: number
  memoryDir: string
  maxMemorySize: number
  enableScheduler: boolean
  channels: ChannelConfig[]
  server?: ServerConfig
}

export type ChannelConfig = {
  type: 'discord' | 'telegram' | 'slack' | 'webhook' | 'stdio' | 
        'wechat' | 'wechat-work' | 'dingtalk' | 'feishu'
  enabled: boolean
  config: Record<string, unknown>
}

export type MemoryCategory = 'preference' | 'project_context' | 'workflow' | 'correction'

export type MemoryScope = {
  projectId?: string
  projectRoot?: string
  isGlobal: boolean
}

export type MemoryEntry = {
  id: string
  timestamp: Date
  type: 'thought' | 'action' | 'observation' | 'reflection'
  content: string
  title?: string
  description?: string
  category?: MemoryCategory
  scope?: MemoryScope
  confidence?: 'high' | 'medium' | 'low'
  evidence?: string
  metadata?: Record<string, unknown>
}

export type MemoryCard = {
  id: string
  title: string
  description: string
  category: MemoryCategory
  scope: MemoryScope
  confidence: 'high' | 'medium' | 'low'
  evidence: string
  createdAt: Date
  updatedAt: Date
  accessCount: number
  lastAccessedAt?: Date
  source: 'auto_extracted' | 'user_provided' | 'dream_distilled'
}

export type ScheduledTask = {
  id: string
  name: string
  cron: string
  handler: string
  enabled: boolean
  lastRun?: Date
  nextRun?: Date
}

export type TickContext = {
  tickNumber: number
  startTime: Date
  state: JarvisState
  recentMemories: MemoryEntry[]
  pendingTasks: ScheduledTask[]
  messages: ChannelMessage[]
}

export type ChannelMessage = {
  id: string
  channel: string
  sender?: string
  content: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

export type JarvisEvent =
  | { type: 'tick'; context: TickContext }
  | { type: 'message'; message: ChannelMessage }
  | { type: 'task'; task: ScheduledTask }
  | { type: 'memory'; entry: MemoryEntry }
  | { type: 'state_change'; from: JarvisState; to: JarvisState }

export type JarvisEventHandler = (event: JarvisEvent) => Promise<void> | void

export type JarvisHooks = {
  onTick?: (context: TickContext) => Promise<void>
  onMessage?: (message: ChannelMessage) => Promise<void>
  onTask?: (task: ScheduledTask) => Promise<void>
  onMemory?: (entry: MemoryEntry) => Promise<void>
  onStateChange?: (from: JarvisState, to: JarvisState) => Promise<void>
}

export type JarvisAgent = {
  id: string
  name: string
  identity: string
  soul?: string
  capabilities: string[]
  hooks: JarvisHooks
}

export type DreamPhase = 'orient' | 'gather' | 'consolidate' | 'prune'

export type DreamResult = {
  phase: DreamPhase
  timestamp: Date
  changes: string[]
  stats: {
    filesProcessed: number
    memoriesMerged: number
    memoriesPruned: number
    duplicatesRemoved: number
  }
}

export type DreamConfig = {
  minHours: number
  minSessions: number
  maxMemoryLines: number
  maxMemorySize: number
  transcriptDir: string
}
