import { getProjectDocs } from '@context'
import { debug as debugLogger } from '@utils/log/debugLogger'
import { logError } from '@utils/log'

class OpenFlowContextManager {
  private static instance: OpenFlowContextManager
  private projectDocsCache = ''
  private cacheInitialized = false
  private initPromise: Promise<void> | null = null

  static getInstance(): OpenFlowContextManager {
    if (!OpenFlowContextManager.instance) {
      OpenFlowContextManager.instance = new OpenFlowContextManager()
    }
    return OpenFlowContextManager.instance
  }

  private async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      try {
        const projectDocs = await getProjectDocs()
        this.projectDocsCache = projectDocs || ''
        this.cacheInitialized = true
      } catch (error) {
        logError(error)
        debugLogger.warn('OPENFLOW_CONTEXT_LOAD_FAILED', {
          error: error instanceof Error ? error.message : String(error),
        })
        this.projectDocsCache = ''
        this.cacheInitialized = true
      }
    })()

    return this.initPromise
  }

  public getOpenFlowContext(): string {
    if (!this.cacheInitialized) {
      this.initialize().catch(error => {
        logError(error)
        debugLogger.warn('OPENFLOW_CONTEXT_LOAD_FAILED', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      return ''
    }
    return this.projectDocsCache
  }

  public async refreshCache(): Promise<void> {
    this.cacheInitialized = false
    this.initPromise = null
    await this.initialize()
  }
}

const openflowContextManager = OpenFlowContextManager.getInstance()

export const generateOpenFlowContext = (): string => {
  return openflowContextManager.getOpenFlowContext()
}

export const refreshOpenFlowContext = async (): Promise<void> => {
  await openflowContextManager.refreshCache()
}

if (process.env.NODE_ENV !== 'test') {
  setTimeout(() => {
    refreshOpenFlowContext().catch(() => {})
  }, 0)
}
