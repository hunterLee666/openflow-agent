import { getPerfettoTracer, beginSlice, endSlice, instant, type SliceCategory } from '../tracing'
import { getCircuitBreaker, type CircuitBreaker } from '../resilience'
import { createProgressTracker, updateProgress, completeProgress, errorProgress, type ProgressPhase } from '../progress'
import { getShellTaskRegistry, killShellTasksForAgent } from '../shell'
import { getMCPConnectionManager, disconnectAllMCPConnections } from '../mcp/connectionManager'
import { getDegradationManager, degradeSystem, recoverSystem } from '../resilience'
import { getTranscriptManager, startTranscriptTurn, endTranscriptTurn, recordToolCall } from '../telemetry/transcript'
import { getAlertManager, checkAlertMetric } from '../alerting'
import { getTTFBMonitor } from '../telemetry/ttfbMonitor'
import { getCacheDashboard } from '../cache/cacheDashboard'

export interface AgentLifecycleOptions {
  agentId: string
  parentId?: string
  model?: string
  traceId?: string
}

export interface AgentLifecycleContext {
  agentId: string
  parentId?: string
  model: string
  traceId: string
  progressTrackerId: string
  turnId: string
  startTime: number
}

class AgentLifecycleManager {
  private contexts: Map<string, AgentLifecycleContext> = new Map()
  private circuitBreakers: Map<string, CircuitBreaker> = new Map()

  initialize(options: AgentLifecycleOptions): AgentLifecycleContext {
    const { agentId, parentId, model = 'default', traceId } = options
    const startTime = Date.now()

    const turnId = startTranscriptTurn(undefined, traceId)
    const progressTracker = createProgressTracker(agentId, parentId)

    const context: AgentLifecycleContext = {
      agentId,
      parentId,
      model,
      traceId: traceId ?? turnId,
      progressTrackerId: progressTracker.id,
      turnId,
      startTime,
    }

    this.contexts.set(agentId, context)

    instant('agent:start', 'agent', {
      agentId,
      parentId,
      model,
      traceId: context.traceId,
    })

    updateProgress(progressTracker.id, {
      phase: 'initializing',
      message: 'Agent initialized',
    })

    return context
  }

  startPhase(agentId: string, phase: ProgressPhase, message?: string): string | undefined {
    const context = this.contexts.get(agentId)
    if (!context) return undefined

    const sliceId = beginSlice('agent', `phase:${phase}`, { agentId, model: context.model })
    updateProgress(context.progressTrackerId, { phase, message })

    return sliceId
  }

  endPhase(sliceId: string | undefined): void {
    if (sliceId) {
      endSlice(sliceId)
    }
  }

  async withToolCall<T>(
    agentId: string,
    toolName: string,
    fn: () => Promise<T>,
    input?: unknown,
  ): Promise<T> {
    const context = this.contexts.get(agentId)
    const startTime = Date.now()

    const toolSliceId = beginSlice('tool', toolName, { agentId })

    try {
      const result = await fn()
      const durationMs = Date.now() - startTime

      if (context) {
        recordToolCall(toolName, input, result, durationMs, undefined, context.turnId)
      }

      endSlice(toolSliceId)
      return result
    } catch (error) {
      const durationMs = Date.now() - startTime

      if (context) {
        recordToolCall(toolName, input, undefined, durationMs, error as Error, context.turnId)
      }

      endSlice(toolSliceId)
      throw error
    }
  }

  async withCircuitBreaker<T>(
    name: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    let breaker = this.circuitBreakers.get(name)
    if (!breaker) {
      breaker = getCircuitBreaker(name)
      this.circuitBreakers.set(name, breaker)
    }

    return breaker.execute(fn)
  }

  checkDegradation(): void {
    const manager = getDegradationManager()
    const stats = getCircuitBreaker('api').getStats()

    if (stats.state === 'open') {
      degradeSystem('API circuit breaker open', 'mcp_disabled')
      checkAlertMetric('circuit_breaker_state', 1)
    }

    const shellStats = getShellTaskRegistry().getStats()
    if (shellStats.running > 10) {
      degradeSystem('Too many shell processes', 'read_only')
    }
  }

  recordMetrics(): void {
    const ttfbMonitor = getTTFBMonitor()
    const cacheDashboard = getCacheDashboard()

    const ttfbAggregate = ttfbMonitor.calculateAggregate()
    if (ttfbAggregate && ttfbAggregate.p95 > 30000) {
      checkAlertMetric('api_latency_p95', ttfbAggregate.p95)
    }

    const cacheAggregate = cacheDashboard.calculateAggregate('hour')
    if (cacheAggregate.hitRate * 100 < 50) {
      checkAlertMetric('cache_hit_rate', cacheAggregate.hitRate * 100)
    }
  }

  async cleanup(agentId: string, reason: 'completed' | 'error' | 'aborted' = 'completed'): Promise<void> {
    const context = this.contexts.get(agentId)
    if (!context) return

    instant('agent:end', 'agent', {
      agentId,
      reason,
      durationMs: Date.now() - context.startTime,
    })

    if (reason === 'completed') {
      completeProgress(context.progressTrackerId, 'Agent completed')
    } else if (reason === 'error') {
      errorProgress(context.progressTrackerId, new Error(reason), `Agent ${reason}`)
    }

    endTranscriptTurn()

    killShellTasksForAgent(agentId)

    this.contexts.delete(agentId)
  }

  async shutdown(): Promise<void> {
    const shellRegistry = getShellTaskRegistry()
    const mcpManager = getMCPConnectionManager()

    for (const [agentId] of Array.from(this.contexts)) {
      await this.cleanup(agentId, 'aborted')
    }

    await shellRegistry.gracefulShutdown(5000)
    await disconnectAllMCPConnections()

    const perfetto = getPerfettoTracer()
    const openCount = perfetto.getOpenSliceCount()
    if (openCount > 0) {
      console.warn(`Warning: ${openCount} open slices remaining`)
    }
  }

  getContext(agentId: string): AgentLifecycleContext | undefined {
    return this.contexts.get(agentId)
  }

  getActiveAgents(): string[] {
    return Array.from(this.contexts.keys())
  }

  getStats(): {
    activeAgents: number
    circuitBreakers: Record<string, ReturnType<CircuitBreaker['getStats']>>
    shell: ReturnType<ReturnType<typeof getShellTaskRegistry>['getStats']>
    mcp: ReturnType<ReturnType<typeof getMCPConnectionManager>['getStats']>
    alerts: ReturnType<ReturnType<typeof getAlertManager>['getStats']>
  } {
    const circuitBreakers: Record<string, ReturnType<CircuitBreaker['getStats']>> = {}
    for (const [name, breaker] of Array.from(this.circuitBreakers)) {
      circuitBreakers[name] = breaker.getStats()
    }

    return {
      activeAgents: this.contexts.size,
      circuitBreakers,
      shell: getShellTaskRegistry().getStats(),
      mcp: getMCPConnectionManager().getStats(),
      alerts: getAlertManager().getStats(),
    }
  }
}

let lifecycleInstance: AgentLifecycleManager | null = null

export function getAgentLifecycleManager(): AgentLifecycleManager {
  if (!lifecycleInstance) {
    lifecycleInstance = new AgentLifecycleManager()
  }
  return lifecycleInstance
}

export function initializeAgentLifecycle(options: AgentLifecycleOptions): AgentLifecycleContext {
  return getAgentLifecycleManager().initialize(options)
}

export function cleanupAgentLifecycle(agentId: string, reason?: 'completed' | 'error' | 'aborted'): Promise<void> {
  return getAgentLifecycleManager().cleanup(agentId, reason)
}

export function withToolCall<T>(
  agentId: string,
  toolName: string,
  fn: () => Promise<T>,
  input?: unknown,
): Promise<T> {
  return getAgentLifecycleManager().withToolCall(agentId, toolName, fn, input)
}

export function startAgentPhase(agentId: string, phase: ProgressPhase, message?: string): string | undefined {
  return getAgentLifecycleManager().startPhase(agentId, phase, message)
}

export function endAgentPhase(sliceId: string | undefined): void {
  getAgentLifecycleManager().endPhase(sliceId)
}

export function getLifecycleStats(): ReturnType<AgentLifecycleManager['getStats']> {
  return getAgentLifecycleManager().getStats()
}

export function setupGlobalLifecycleHandlers(): void {
  const manager = getAgentLifecycleManager()

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...')
    await manager.shutdown()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...')
    await manager.shutdown()
    process.exit(0)
  })

  process.on('beforeExit', async () => {
    await manager.shutdown()
  })
}
