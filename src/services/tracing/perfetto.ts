import { randomUUID } from 'crypto'

export type SliceCategory = 'agent' | 'model' | 'tool' | 'mcp' | 'http' | 'ui'

export interface PerfettoSlice {
  cat: SliceCategory
  name: string
  ts: number
  dur: number
  ph: 'B' | 'E' | 'X' | 'i'
  pid: number
  tid: number
  id?: string
  args?: Record<string, unknown>
}

export interface PerfettoEvent {
  name: string
  cat: SliceCategory
  ph: 'B' | 'E' | 'X' | 'i' | 'f' | 's' | 'b' | 'e'
  ts: number
  pid?: number
  tid?: number
  id?: string
  args?: Record<string, unknown>
}

export interface PerfettoTrace {
  traceEvents: PerfettoEvent[]
  metadata?: {
    version: string
    processName?: string
    startTime: number
  }
}

export type PerfettoEmitter = {
  beginSlice(cat: SliceCategory, name: string, args?: Record<string, unknown>): string
  endSlice(sliceId: string): void
  instant(name: string, cat: SliceCategory, args?: Record<string, unknown>): void
  asyncStart(name: string, id: string, cat?: SliceCategory): void
  asyncEnd(name: string, id: string, cat?: SliceCategory): void
}

export interface PerfettoAgentModule {
  name: string
  version: string
  onTrace: (emit: PerfettoEmitter) => void | (() => void)
}

type OpenSlice = {
  id: string
  cat: SliceCategory
  name: string
  startTime: number
  args?: Record<string, unknown>
}

class PerfettoTracer {
  private events: PerfettoEvent[] = []
  private openSlices: Map<string, OpenSlice> = new Map()
  private modules: Map<string, { module: PerfettoAgentModule; dispose?: () => void }> = new Map()
  private enabled: boolean = true
  private sampleRate: number = 1.0
  private pid: number = process.pid
  private tid: number = 0
  private startTime: number = Date.now()

  constructor() {
    this.tid = Math.floor(Math.random() * 10000)
  }

  setSampleRate(rate: number): void {
    this.sampleRate = Math.max(0, Math.min(1, rate))
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  shouldSample(): boolean {
    if (!this.enabled) return false
    if (this.sampleRate >= 1) return true
    if (this.sampleRate <= 0) return false
    return Math.random() < this.sampleRate
  }

  registerModule(module: PerfettoAgentModule): () => void {
    if (this.modules.has(module.name)) {
      console.warn(`Perfetto module "${module.name}" already registered`)
      return () => {}
    }

    const emitter: PerfettoEmitter = {
      beginSlice: (cat, name, args) => this.beginSlice(cat, name, args),
      endSlice: (sliceId) => this.endSlice(sliceId),
      instant: (name, cat, args) => this.instant(name, cat, args),
      asyncStart: (name, id, cat) => this.asyncStart(name, id, cat),
      asyncEnd: (name, id, cat) => this.asyncEnd(name, id, cat),
    }

    const result = module.onTrace(emitter)
    const dispose = typeof result === 'function' ? result : undefined
    this.modules.set(module.name, { module, dispose })

    return () => this.unregisterModule(module.name)
  }

  private unregisterModule(name: string): void {
    const entry = this.modules.get(name)
    if (entry) {
      entry.dispose?.()
      this.modules.delete(name)
    }
  }

  beginSlice(cat: SliceCategory, name: string, args?: Record<string, unknown>): string {
    if (!this.shouldSample()) return ''

    const id = randomUUID()
    const ts = this.getTimestamp()

    this.openSlices.set(id, {
      id,
      cat,
      name,
      startTime: ts,
      args,
    })

    this.events.push({
      name,
      cat,
      ph: 'B',
      ts,
      pid: this.pid,
      tid: this.tid,
      id,
      args,
    })

    return id
  }

  endSlice(sliceId: string): void {
    if (!sliceId) return

    const openSlice = this.openSlices.get(sliceId)
    if (!openSlice) return

    const ts = this.getTimestamp()
    this.openSlices.delete(sliceId)

    this.events.push({
      name: openSlice.name,
      cat: openSlice.cat,
      ph: 'E',
      ts,
      pid: this.pid,
      tid: this.tid,
      id: sliceId,
      args: openSlice.args,
    })
  }

  instant(name: string, cat: SliceCategory, args?: Record<string, unknown>): void {
    if (!this.shouldSample()) return

    this.events.push({
      name,
      cat,
      ph: 'i',
      ts: this.getTimestamp(),
      pid: this.pid,
      tid: this.tid,
      args,
    })
  }

  asyncStart(name: string, id: string, cat: SliceCategory = 'agent'): void {
    if (!this.shouldSample()) return

    this.events.push({
      name,
      cat,
      ph: 'b',
      ts: this.getTimestamp(),
      pid: this.pid,
      tid: this.tid,
      id,
    })
  }

  asyncEnd(name: string, id: string, cat: SliceCategory = 'agent'): void {
    if (!this.shouldSample()) return

    this.events.push({
      name,
      cat,
      ph: 'e',
      ts: this.getTimestamp(),
      pid: this.pid,
      tid: this.tid,
      id,
    })
  }

  private getTimestamp(): number {
    const now = performance.now()
    return Math.floor(now * 1000)
  }

  getEvents(): PerfettoEvent[] {
    return [...this.events]
  }

  getTrace(): PerfettoTrace {
    return {
      traceEvents: this.events,
      metadata: {
        version: '1.0',
        processName: 'openflow-agent',
        startTime: this.startTime,
      },
    }
  }

  clear(): void {
    this.events = []
    this.openSlices.clear()
  }

  exportJson(): string {
    return JSON.stringify(this.getTrace(), null, 2)
  }

  getOpenSliceCount(): number {
    return this.openSlices.size
  }

  getEventCount(): number {
    return this.events.length
  }
}

let tracerInstance: PerfettoTracer | null = null

export function getPerfettoTracer(): PerfettoTracer {
  if (!tracerInstance) {
    tracerInstance = new PerfettoTracer()
  }
  return tracerInstance
}

export function registerPerfettoAgent(module: PerfettoAgentModule): () => void {
  return getPerfettoTracer().registerModule(module)
}

export function beginSlice(cat: SliceCategory, name: string, args?: Record<string, unknown>): string {
  return getPerfettoTracer().beginSlice(cat, name, args)
}

export function endSlice(sliceId: string): void {
  getPerfettoTracer().endSlice(sliceId)
}

export function instant(name: string, cat: SliceCategory, args?: Record<string, unknown>): void {
  getPerfettoTracer().instant(name, cat, args)
}

export function withSlice<T>(cat: SliceCategory, name: string, fn: () => T, args?: Record<string, unknown>): T {
  const sliceId = beginSlice(cat, name, args)
  try {
    return fn()
  } finally {
    endSlice(sliceId)
  }
}

export async function withSliceAsync<T>(cat: SliceCategory, name: string, fn: () => Promise<T>, args?: Record<string, unknown>): Promise<T> {
  const sliceId = beginSlice(cat, name, args)
  try {
    return await fn()
  } finally {
    endSlice(sliceId)
  }
}

export function generateTraceId(): string {
  return randomUUID()
}

export function generateSpanId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16)
}
