import { spawn, ChildProcess } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

export interface LspServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export interface LspCapabilities {
  textDocumentSync?: number
  completionProvider?: { triggerCharacters?: string[] }
  hoverProvider?: boolean
  definitionProvider?: boolean
  referencesProvider?: boolean
  documentSymbolProvider?: boolean
  workspaceSymbolProvider?: boolean
  implementationProvider?: boolean
  typeDefinitionProvider?: boolean
  callHierarchyProvider?: boolean
  [key: string]: unknown
}

export interface LspServerInfo {
  name: string
  version?: string
}

export interface LspInitializeResult {
  capabilities: LspCapabilities
  serverInfo?: LspServerInfo
}

export interface LspPosition {
  line: number
  character: number
}

export interface LspRange {
  start: LspPosition
  end: LspPosition
}

export interface LspLocation {
  uri: string
  range: LspRange
}

export interface LspDiagnostic {
  range: LspRange
  severity?: number
  code?: string | number
  source?: string
  message: string
}

export interface LspHover {
  contents: unknown
  range?: LspRange
}

export interface LspDocumentSymbol {
  name: string
  kind: number
  range: LspRange
  selectionRange: LspRange
  children?: LspDocumentSymbol[]
}

export interface LspWorkspaceSymbol {
  name: string
  kind: number
  location: LspLocation | { uri: string }
  containerName?: string
}

export type LspStatus = 'stopped' | 'starting' | 'ready' | 'error'

export interface LspServerState {
  language: string
  status: LspStatus
  error?: string
  capabilities?: LspCapabilities
  serverInfo?: LspServerInfo
  lastActivity: number
  requestCount: number
}

const LANGUAGE_SERVER_CONFIGS: Record<string, LspServerConfig> = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  javascript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  typescriptreact: {
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  javascriptreact: {
    command: 'typescript-language-server',
    args: ['--stdio'],
  },
  python: {
    command: 'pylsp',
    args: [],
  },
  go: {
    command: 'gopls',
    args: ['serve'],
  },
  rust: {
    command: 'rust-analyzer',
    args: [],
  },
  java: {
    command: 'jdtls',
    args: [],
  },
  c: {
    command: 'clangd',
    args: [],
  },
  cpp: {
    command: 'clangd',
    args: [],
  },
  json: {
    command: 'vscode-json-languageserver',
    args: ['--stdio'],
  },
  yaml: {
    command: 'yaml-language-server',
    args: ['--stdio'],
  },
  html: {
    command: 'vscode-html-languageserver',
    args: ['--stdio'],
  },
  css: {
    command: 'vscode-css-languageserver',
    args: ['--stdio'],
  },
}

export class LspClient {
  private process: ChildProcess | null = null
  private nextId = 1
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()
  private buffer = ''
  private capabilities: LspCapabilities | null = null
  private serverInfo: LspServerInfo | null = null
  private status: LspStatus = 'stopped'
  private lastError: string | undefined
  private requestCount = 0
  private lastActivity = 0
  private onDiagnosticsCallback?: (uri: string, diagnostics: LspDiagnostic[]) => void
  private onStatusChangeCallback?: (status: LspStatus) => void

  constructor(
    private language: string,
    private config: LspServerConfig,
    private rootPath: string,
    private timeoutMs: number = 30000,
  ) {}

  async start(): Promise<LspInitializeResult> {
    if (this.process) {
      throw new Error('LSP server already running')
    }

    this.setStatus('starting')

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.config.command, this.config.args || [], {
          cwd: this.config.cwd || this.rootPath,
          env: { ...process.env, ...this.config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
          throw new Error('Failed to create stdio streams')
        }

        this.process.stderr.on('data', (data) => {
          console.error(`[LSP ${this.language} stderr]`, data.toString())
        })

        this.process.on('error', (error) => {
          this.lastError = error.message
          this.setStatus('error')
          reject(error)
        })

        this.process.on('exit', (code) => {
          this.process = null
          if (code !== 0 && code !== null) {
            this.lastError = `Process exited with code ${code}`
            this.setStatus('error')
          } else {
            this.setStatus('stopped')
          }
        })

        this.process.stdout.on('data', (data) => {
          this.handleData(data.toString())
        })

        this.initialize()
          .then((result) => {
            this.capabilities = result.capabilities
            this.serverInfo = result.serverInfo || null
            this.setStatus('ready')
            resolve(result)
          })
          .catch((error) => {
            this.lastError = error.message
            this.setStatus('error')
            reject(error)
          })
      } catch (error) {
        this.lastError = String(error)
        this.setStatus('error')
        reject(error)
      }
    })
  }

  async stop(): Promise<void> {
    if (!this.process) return

    for (const [id, pending] of Array.from(this.pendingRequests.entries())) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('LSP server stopped'))
    }
    this.pendingRequests.clear()

    try {
      await this.sendRequest('shutdown', null, 5000)
    } catch {
      // Ignore shutdown errors
    }

    this.process.kill()
    this.process = null
    this.setStatus('stopped')
  }

  async restart(): Promise<LspInitializeResult> {
    await this.stop()
    return this.start()
  }

  getStatus(): LspStatus {
    return this.status
  }

  getState(): LspServerState {
    return {
      language: this.language,
      status: this.status,
      error: this.lastError,
      capabilities: this.capabilities || undefined,
      serverInfo: this.serverInfo || undefined,
      lastActivity: this.lastActivity,
      requestCount: this.requestCount,
    }
  }

  onDiagnostics(callback: (uri: string, diagnostics: LspDiagnostic[]) => void): void {
    this.onDiagnosticsCallback = callback
  }

  onStatusChange(callback: (status: LspStatus) => void): void {
    this.onStatusChangeCallback = callback
  }

  async openDocument(uri: string, languageId: string, content: string, version: number = 1): Promise<void> {
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text: content,
      },
    })
  }

  async closeDocument(uri: string): Promise<void> {
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    })
  }

  async changeDocument(uri: string, version: number, content: string): Promise<void> {
    this.sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text: content }],
    })
  }

  async hover(uri: string, position: LspPosition): Promise<LspHover | null> {
    return this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position,
    }) as Promise<LspHover | null>
  }

  async definition(uri: string, position: LspPosition): Promise<LspLocation | LspLocation[] | null> {
    return this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position,
    }) as Promise<LspLocation | LspLocation[] | null>
  }

  async references(uri: string, position: LspPosition, includeDeclaration: boolean = true): Promise<LspLocation[] | null> {
    return this.sendRequest('textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration },
    }) as Promise<LspLocation[] | null>
  }

  async documentSymbols(uri: string): Promise<LspDocumentSymbol[] | null> {
    return this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    }) as Promise<LspDocumentSymbol[] | null>
  }

  async workspaceSymbols(query: string = ''): Promise<LspWorkspaceSymbol[] | null> {
    return this.sendRequest('workspace/symbol', { query }) as Promise<LspWorkspaceSymbol[] | null>
  }

  async implementation(uri: string, position: LspPosition): Promise<LspLocation | LspLocation[] | null> {
    return this.sendRequest('textDocument/implementation', {
      textDocument: { uri },
      position,
    }) as Promise<LspLocation | LspLocation[] | null>
  }

  async typeDefinition(uri: string, position: LspPosition): Promise<LspLocation | LspLocation[] | null> {
    return this.sendRequest('textDocument/typeDefinition', {
      textDocument: { uri },
      position,
    }) as Promise<LspLocation | LspLocation[] | null>
  }

  private async initialize(): Promise<LspInitializeResult> {
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: pathToFileUri(this.rootPath),
      capabilities: {
        textDocument: {
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        },
        workspace: {
          symbol: {},
        },
      },
    })

    this.sendNotification('initialized', {})

    return result as LspInitializeResult
  }

  private sendRequest(method: string, params: unknown, timeoutOverride?: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('LSP server not running'))
        return
      }

      const id = this.nextId++
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      })

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`LSP request timeout: ${method}`))
      }, timeoutOverride || this.timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timeout })
      this.requestCount++
      this.lastActivity = Date.now()

      const content = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`
      this.process.stdin.write(content)
    })
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.process || !this.process.stdin) return

    const message = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
    })

    const content = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`
    this.process.stdin.write(content)
  }

  private handleData(data: string): void {
    this.buffer += data

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break

      const header = this.buffer.slice(0, headerEnd)
      const contentLengthMatch = header.match(/Content-Length: (\d+)/i)
      if (!contentLengthMatch) break

      const contentLength = parseInt(contentLengthMatch[1], 10)
      const messageStart = headerEnd + 4
      const messageEnd = messageStart + contentLength

      if (this.buffer.length < messageEnd) break

      const message = this.buffer.slice(messageStart, messageEnd)
      this.buffer = this.buffer.slice(messageEnd)

      try {
        this.handleMessage(JSON.parse(message))
      } catch (error) {
        console.error(`[LSP ${this.language}] Failed to parse message:`, error)
      }
    }
  }

  private handleMessage(message: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } }): void {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        clearTimeout(pending.timeout)

        if (message.error) {
          pending.reject(new Error(message.error.message))
        } else {
          pending.resolve(message.result)
        }
      }
    } else if (message.method === 'textDocument/publishDiagnostics' && message.params) {
      const params = message.params as { uri: string; diagnostics: LspDiagnostic[] }
      this.onDiagnosticsCallback?.(params.uri, params.diagnostics)
    }
  }

  private setStatus(status: LspStatus): void {
    this.status = status
    this.onStatusChangeCallback?.(status)
  }
}

function pathToFileUri(filePath: string): string {
  return `file://${filePath.startsWith('/') ? '' : '/'}${filePath.replace(/\\/g, '/')}`
}

export class LspManager {
  private clients: Map<string, LspClient> = new Map()
  private rootPath: string
  private timeoutMs: number
  private autoStart: boolean

  constructor(rootPath: string, options?: { timeoutMs?: number; autoStart?: boolean }) {
    this.rootPath = rootPath
    this.timeoutMs = options?.timeoutMs || 30000
    this.autoStart = options?.autoStart ?? true
  }

  async getOrCreateClient(language: string): Promise<LspClient | null> {
    const existing = this.clients.get(language)
    if (existing) {
      return existing
    }

    const config = LANGUAGE_SERVER_CONFIGS[language]
    if (!config) {
      return null
    }

    if (!await this.isServerAvailable(config.command)) {
      console.warn(`[LSP] Language server not available: ${config.command}`)
      return null
    }

    const client = new LspClient(language, config, this.rootPath, this.timeoutMs)

    try {
      await client.start()
      this.clients.set(language, client)
      return client
    } catch (error) {
      console.error(`[LSP] Failed to start ${language} server:`, error)
      return null
    }
  }

  getClient(language: string): LspClient | undefined {
    return this.clients.get(language)
  }

  async stopClient(language: string): Promise<void> {
    const client = this.clients.get(language)
    if (client) {
      await client.stop()
      this.clients.delete(language)
    }
  }

  async stopAll(): Promise<void> {
    const stops = Array.from(this.clients.values()).map(c => c.stop())
    await Promise.all(stops)
    this.clients.clear()
  }

  getSupportedLanguages(): string[] {
    return Object.keys(LANGUAGE_SERVER_CONFIGS)
  }

  getRunningClients(): LspClient[] {
    return Array.from(this.clients.values()).filter(c => c.getStatus() === 'ready')
  }

  getAllStates(): LspServerState[] {
    return Array.from(this.clients.values()).map(c => c.getState())
  }

  private async isServerAvailable(command: string): Promise<boolean> {
    try {
      const result = await new Promise<boolean>((resolve) => {
        const proc = spawn(command, ['--version'], { stdio: 'ignore' })
        proc.on('error', () => resolve(false))
        proc.on('exit', (code) => resolve(code === 0))
      })
      return result
    } catch {
      return false
    }
  }
}

let managerInstance: LspManager | null = null

export function getLspManager(rootPath?: string, options?: { timeoutMs?: number; autoStart?: boolean }): LspManager {
  if (!managerInstance && rootPath) {
    managerInstance = new LspManager(rootPath, options)
  }
  if (!managerInstance) {
    throw new Error('LSP manager not initialized. Call getLspManager with rootPath first.')
  }
  return managerInstance
}

export function resetLspManager(): void {
  if (managerInstance) {
    managerInstance.stopAll()
    managerInstance = null
  }
}

export function getLanguageFromFile(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  const extToLanguage: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'css',
  }
  return extToLanguage[ext] || null
}
