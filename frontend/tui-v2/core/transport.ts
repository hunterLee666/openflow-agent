import { EventEmitter } from 'events'

export interface TransportMessage {
  id: string
  type: 'request' | 'response' | 'event' | 'error'
  channel: string
  payload: unknown
  timestamp: Date
  metadata?: Record<string, unknown>
}

export interface TransportHandler {
  onMessage?: (msg: TransportMessage) => void | Promise<void>
  onConnect?: () => void | Promise<void>
  onDisconnect?: () => void | Promise<void>
  onError?: (err: Error) => void
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private handler: TransportHandler
  private isConnecting = false

  constructor(url: string, handler: TransportHandler) {
    super()
    this.setMaxListeners(0)
    this.url = url
    this.handler = handler
    
    this.on('error', () => {})
  }

  async connect(): Promise<void> {
    if (this.isConnecting) return
    this.isConnecting = true

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.reconnectAttempts = 0
          this.isConnecting = false
          console.error('[WS] Connected to backend')
          this.handler.onConnect?.()
          this.emit('connected')
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: TransportMessage = JSON.parse(event.data)
            this.handler.onMessage?.(message)
            this.emit('message', message)
          } catch {
            console.error('[WS] Failed to parse message')
          }
        }

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error)
          this.isConnecting = false
          this.handler.onError?.(new Error('WebSocket error'))
          this.emit('error', error)
          reject(new Error('WebSocket error'))
        }

        this.ws.onclose = () => {
          console.error('[WS] Disconnected')
          this.isConnecting = false
          this.handler.onDisconnect?.()
          this.emit('disconnected')
          this.attemptReconnect()
        }
      } catch (error) {
        this.isConnecting = false
        const err = error instanceof Error ? error : new Error(String(error))
        console.error('[WS] Connection failed:', err.message)
        this.handler.onError?.(err)
        reject(err)
      }
    })
  }

  async send(message: TransportMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    try {
      const data = JSON.stringify(message)
      this.ws.send(data)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.handler.onError?.(err)
      throw err
    }
  }

  async disconnect(): Promise<void> {
    this.reconnectAttempts = this.maxReconnectAttempts
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.handler.onDisconnect?.()
    this.emit('disconnected')
  }

  isConnected(): boolean {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.error(`[WS] Reconnecting in ${delay}ms...`)
    setTimeout(() => {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.connect().catch(() => {})
      }
    }, delay)
  }
}
