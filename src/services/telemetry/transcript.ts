import { createHash } from 'crypto'

export type TranscriptEventType =
  | 'user_input'
  | 'assistant_response'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'system'

export interface ToolSpan {
  name: string
  inputDigest: string
  outputDigest: string
  durationMs: number
  success: boolean
  errorMessage?: string
}

export interface TranscriptEvent {
  id: string
  turnId: string
  traceId?: string
  type: TranscriptEventType
  ts: string
  actor: 'user' | 'agent' | 'sub-agent' | 'system'
  model?: string
  inputDigest?: string
  outputDigest?: string
  toolSpans?: ToolSpan[]
  status: 'ok' | 'error' | 'aborted'
  metadata?: Record<string, unknown>
}

export interface TranscriptConfig {
  enabled: boolean
  forceEnabled: boolean
  maxEvents: number
  persistToDisk: boolean
  storagePath?: string
}

const DEFAULT_CONFIG: TranscriptConfig = {
  enabled: true,
  forceEnabled: false,
  maxEvents: 10000,
  persistToDisk: false,
}

function assertTranscriptEnabled(config: TranscriptConfig): void {
  if (config.forceEnabled && !config.enabled) {
    throw new Error('Transcript recording cannot be disabled in this environment')
  }
}

function createDigest(content: string, maxLength: number = 200): string {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16)
  const truncated = content.length > maxLength
    ? content.slice(0, maxLength) + '…'
    : content
  return `${hash}:${truncated.length}`
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

class TranscriptManager {
  private events: TranscriptEvent[] = []
  private config: TranscriptConfig
  private currentTurnId: string | null = null
  private currentTraceId: string | null = null
  private currentToolSpans: ToolSpan[] = []

  constructor(config: Partial<TranscriptConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    assertTranscriptEnabled(this.config)
  }

  startTurn(turnId?: string, traceId?: string): string {
    this.currentTurnId = turnId ?? generateId()
    this.currentTraceId = traceId ?? generateId()
    this.currentToolSpans = []
    return this.currentTurnId
  }

  endTurn(): void {
    this.currentTurnId = null
    this.currentTraceId = null
    this.currentToolSpans = []
  }

  append(event: Omit<TranscriptEvent, 'id' | 'ts'>): TranscriptEvent {
    if (!this.config.enabled) {
      throw new Error('Transcript recording is disabled')
    }

    const fullEvent: TranscriptEvent = Object.freeze({
      ...event,
      id: generateId(),
      ts: new Date().toISOString(),
      turnId: event.turnId ?? this.currentTurnId ?? generateId(),
      traceId: event.traceId ?? this.currentTraceId ?? undefined,
    })

    this.events.push(fullEvent)

    if (this.events.length > this.config.maxEvents) {
      this.events.shift()
    }

    return fullEvent
  }

  recordUserInput(text: string, turnId?: string): TranscriptEvent {
    return this.append({
      type: 'user_input',
      turnId: turnId ?? this.currentTurnId ?? generateId(),
      actor: 'user',
      inputDigest: createDigest(text),
      status: 'ok',
    })
  }

  recordAssistantResponse(
    text: string,
    model: string,
    turnId?: string,
    toolSpans?: ToolSpan[],
  ): TranscriptEvent {
    return this.append({
      type: 'assistant_response',
      turnId: turnId ?? this.currentTurnId ?? generateId(),
      actor: 'agent',
      model,
      outputDigest: createDigest(text),
      toolSpans: toolSpans ?? this.currentToolSpans,
      status: 'ok',
    })
  }

  recordToolCall(
    name: string,
    input: unknown,
    output: unknown,
    durationMs: number,
    error?: Error,
    turnId?: string,
  ): TranscriptEvent {
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input)
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output)

    const toolSpan: ToolSpan = {
      name,
      inputDigest: createDigest(inputStr),
      outputDigest: createDigest(outputStr),
      durationMs,
      success: !error,
      errorMessage: error?.message,
    }

    this.currentToolSpans.push(toolSpan)

    return this.append({
      type: 'tool_call',
      turnId: turnId ?? this.currentTurnId ?? generateId(),
      actor: 'agent',
      toolSpans: [toolSpan],
      status: error ? 'error' : 'ok',
    })
  }

  recordError(error: Error, context?: Record<string, unknown>, turnId?: string): TranscriptEvent {
    return this.append({
      type: 'error',
      turnId: turnId ?? this.currentTurnId ?? generateId(),
      actor: 'system',
      status: 'error',
      metadata: {
        errorType: error.constructor.name,
        errorMessage: error.message,
        errorStack: error.stack,
        ...context,
      },
    })
  }

  recordSystemEvent(message: string, metadata?: Record<string, unknown>): TranscriptEvent {
    return this.append({
      type: 'system',
      turnId: this.currentTurnId ?? generateId(),
      actor: 'system',
      status: 'ok',
      metadata: { message, ...metadata },
    })
  }

  getEvents(turnId?: string): TranscriptEvent[] {
    if (turnId) {
      return this.events.filter(e => e.turnId === turnId)
    }
    return [...this.events]
  }

  getEventsByType(type: TranscriptEventType): TranscriptEvent[] {
    return this.events.filter(e => e.type === type)
  }

  getEventsByTrace(traceId: string): TranscriptEvent[] {
    return this.events.filter(e => e.traceId === traceId)
  }

  getEvent(id: string): TranscriptEvent | undefined {
    return this.events.find(e => e.id === id)
  }

  getStats(): {
    total: number
    byType: Record<TranscriptEventType, number>
    byStatus: Record<string, number>
    errors: number
  } {
    const byType: Record<TranscriptEventType, number> = {
      user_input: 0,
      assistant_response: 0,
      tool_call: 0,
      tool_result: 0,
      error: 0,
      system: 0,
    }
    const byStatus: Record<string, number> = { ok: 0, error: 0, aborted: 0 }
    let errors = 0

    for (const event of this.events) {
      byType[event.type]++
      byStatus[event.status]++
      if (event.status === 'error') {
        errors++
      }
    }

    return { total: this.events.length, byType, byStatus, errors }
  }

  clear(): void {
    this.events = []
    this.currentTurnId = null
    this.currentTraceId = null
    this.currentToolSpans = []
  }

  export(): string {
    return JSON.stringify(this.events, null, 2)
  }

  exportTurn(turnId: string): string {
    return JSON.stringify(this.getEvents(turnId), null, 2)
  }

  setEnabled(enabled: boolean): void {
    if (this.config.forceEnabled && !enabled) {
      throw new Error('Transcript recording cannot be disabled in this environment')
    }
    this.config.enabled = enabled
  }

  isEnabled(): boolean {
    return this.config.enabled
  }
}

let managerInstance: TranscriptManager | null = null

export function getTranscriptManager(config?: Partial<TranscriptConfig>): TranscriptManager {
  if (!managerInstance) {
    managerInstance = new TranscriptManager(config)
  }
  return managerInstance
}

export function startTranscriptTurn(turnId?: string, traceId?: string): string {
  return getTranscriptManager().startTurn(turnId, traceId)
}

export function endTranscriptTurn(): void {
  getTranscriptManager().endTurn()
}

export function appendTranscript(event: Omit<TranscriptEvent, 'id' | 'ts'>): TranscriptEvent {
  return getTranscriptManager().append(event)
}

export function recordUserInput(text: string, turnId?: string): TranscriptEvent {
  return getTranscriptManager().recordUserInput(text, turnId)
}

export function recordAssistantResponse(
  text: string,
  model: string,
  turnId?: string,
  toolSpans?: ToolSpan[],
): TranscriptEvent {
  return getTranscriptManager().recordAssistantResponse(text, model, turnId, toolSpans)
}

export function recordToolCall(
  name: string,
  input: unknown,
  output: unknown,
  durationMs: number,
  error?: Error,
  turnId?: string,
): TranscriptEvent {
  return getTranscriptManager().recordToolCall(name, input, output, durationMs, error, turnId)
}

export function recordTranscriptError(
  error: Error,
  context?: Record<string, unknown>,
  turnId?: string,
): TranscriptEvent {
  return getTranscriptManager().recordError(error, context, turnId)
}

export function getTranscriptEvents(turnId?: string): TranscriptEvent[] {
  return getTranscriptManager().getEvents(turnId)
}

export function assertTranscriptRecordingEnabled(): void {
  const manager = getTranscriptManager()
  if (!manager.isEnabled()) {
    throw new Error('Transcript recording is disabled')
  }
}
