import { createServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from 'http'
import type { ServerConfig, ChannelMessage } from './types'
import { JarvisChannel } from './channel'
import { createHmac } from 'crypto'

type CallbackHandler = (message: ChannelMessage) => Promise<void> | void

type PlatformCallback = {
  platform: string
  data: Record<string, unknown>
  signature?: string
  timestamp?: string
}

export class JarvisServer {
  private config: ServerConfig
  private channel: JarvisChannel
  private server: HttpServer | null = null
  private handlers: Map<string, CallbackHandler[]> = new Map()
  private running: boolean = false

  constructor(config: ServerConfig, channel: JarvisChannel) {
    this.config = config
    this.channel = channel
  }

  async start(): Promise<void> {
    if (this.running) {
      return
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res)
      })

      this.server.listen(this.config.port, this.config.host, () => {
        this.running = true
        console.log(`Jarvis server listening on ${this.config.host}:${this.config.port}`)
        resolve()
      })

      this.server.on('error', (error) => {
        console.error('Jarvis server error:', error)
        reject(error)
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false
        this.server = null
        console.log('Jarvis server stopped')
        resolve()
      })
    })
  }

  isRunning(): boolean {
    return this.running
  }

  onCallback(platform: string, handler: CallbackHandler): () => void {
    if (!this.handlers.has(platform)) {
      this.handlers.set(platform, [])
    }
    this.handlers.get(platform)!.push(handler)

    return () => {
      const handlers = this.handlers.get(platform)
      if (handlers) {
        const index = handlers.indexOf(handler)
        if (index > -1) {
          handlers.splice(index, 1)
        }
      }
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const path = url.pathname

    const basePath = this.config.path || '/jarvis'
    if (!path.startsWith(basePath)) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    const body = await this.readBody(req)
    const platform = this.detectPlatform(req, body)

    if (!platform) {
      res.statusCode = 400
      res.end('Unknown platform')
      return
    }

    try {
      const callback = await this.parseCallback(platform, req, body)
      
      const valid = await this.validateCallback(platform, callback, req)
      if (!valid) {
        res.statusCode = 401
        res.end('Invalid signature')
        return
      }

      const message = await this.processCallback(platform, callback)
      
      const handlers = this.handlers.get(platform) || []
      for (const handler of handlers) {
        try {
          await handler(message)
        } catch (error) {
          console.error(`Callback handler failed for ${platform}:`, error)
        }
      }

      if (message) {
        await this.channel.receiveMessage(
          platform,
          message.content,
          message.sender,
          message.metadata,
        )
      }

      const response = this.getResponse(platform, callback)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(response))
    } catch (error) {
      console.error('Failed to process callback:', error)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })
  }

  private detectPlatform(req: IncomingMessage, body: string): string | null {
    const userAgent = req.headers['user-agent'] || ''
    const contentType = req.headers['content-type'] || ''

    if (userAgent.toLowerCase().includes('dingtalk')) {
      return 'dingtalk'
    }
    if (userAgent.toLowerCase().includes('feishu')) {
      return 'feishu'
    }
    if (userAgent.toLowerCase().includes('wechat') || userAgent.toLowerCase().includes('micromessenger')) {
      return 'wechat'
    }

    try {
      const data = JSON.parse(body)
      if (data.msgtype || data.text || data.markdown) {
        if (data.msgtype === 'text' || data.msgtype === 'markdown') {
          return 'wechat-work'
        }
      }
      if (data.type === 'event' || data.header?.token || data.event) {
        return 'feishu'
      }
      if (data.EventType || data.processInstanceKey) {
        return 'dingtalk'
      }
    } catch {
    }

    return null
  }

  private async parseCallback(platform: string, req: IncomingMessage, body: string): Promise<PlatformCallback> {
    const contentType = req.headers['content-type'] || ''
    let data: Record<string, unknown> = {}

    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(body)
      } catch {
        data = { raw: body }
      }
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      data = this.parseFormData(body)
    } else {
      try {
        data = JSON.parse(body)
      } catch {
        data = { raw: body }
      }
    }

    const signature = req.headers['x-signature'] as string || 
                      req.headers['x-dingtalk-signature'] as string ||
                      req.headers['x-lark-signature'] as string

    const timestamp = req.headers['x-timestamp'] as string ||
                      req.headers['x-dingtalk-timestamp'] as string

    return { platform, data, signature, timestamp }
  }

  private parseFormData(body: string): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const pairs = body.split('&')
    for (const pair of pairs) {
      const [key, value] = pair.split('=')
      if (key && value) {
        result[decodeURIComponent(key)] = decodeURIComponent(value)
      }
    }
    return result
  }

  private async validateCallback(platform: string, callback: PlatformCallback, req: IncomingMessage): Promise<boolean> {
    const channelConfig = this.channel.getChannel(platform)
    if (!channelConfig) {
      return false
    }

    const secret = channelConfig.config.secret as string | undefined
    if (!secret) {
      return true
    }

    switch (platform) {
      case 'dingtalk':
        return this.validateDingtalk(callback, secret)
      case 'feishu':
        return this.validateFeishu(callback, secret)
      case 'wechat-work':
        return this.validateWechatWork(callback, secret)
      default:
        return true
    }
  }

  private validateDingtalk(callback: PlatformCallback, secret: string): boolean {
    if (!callback.signature || !callback.timestamp) {
      return false
    }

    const timestamp = callback.timestamp
    const message = `${timestamp}\n${secret}`
    const hmac = createHmac('sha256', secret)
    hmac.update(message)
    const expectedSignature = encodeURIComponent(hmac.digest('base64'))

    return callback.signature === expectedSignature
  }

  private validateFeishu(callback: PlatformCallback, secret: string): boolean {
    if (!callback.signature) {
      return true
    }

    const hmac = createHmac('sha256', secret)
    hmac.update(JSON.stringify(callback.data))
    const expectedSignature = hmac.digest('base64')

    return callback.signature === expectedSignature
  }

  private validateWechatWork(callback: PlatformCallback, secret: string): boolean {
    return true
  }

  private async processCallback(platform: string, callback: PlatformCallback): Promise<ChannelMessage | null> {
    const data = callback.data

    switch (platform) {
      case 'dingtalk':
        return this.processDingtalk(data)
      case 'feishu':
        return this.processFeishu(data)
      case 'wechat-work':
        return this.processWechatWork(data)
      case 'wechat':
        return this.processWechat(data)
      default:
        return {
          id: `msg-${Date.now()}`,
          channel: platform,
          content: JSON.stringify(data),
          timestamp: new Date(),
          metadata: data,
        }
    }
  }

  private processDingtalk(data: Record<string, unknown>): ChannelMessage | null {
    const content = data.content as Record<string, unknown>
    const sender = data.senderId as string || data.senderNick as string

    return {
      id: `dingtalk-${Date.now()}`,
      channel: 'dingtalk',
      sender,
      content: content?.content as string || JSON.stringify(data),
      timestamp: new Date(),
      metadata: data,
    }
  }

  private processFeishu(data: Record<string, unknown>): ChannelMessage | null {
    const event = data.event as Record<string, unknown>
    const message = event?.message as Record<string, unknown>
    const sender = event?.sender as Record<string, unknown>
    const senderId = sender?.sender_id as Record<string, unknown> | undefined

    return {
      id: `feishu-${Date.now()}`,
      channel: 'feishu',
      sender: senderId?.open_id as string | undefined,
      content: message?.content as string || JSON.stringify(data),
      timestamp: new Date(),
      metadata: data,
    }
  }

  private processWechatWork(data: Record<string, unknown>): ChannelMessage | null {
    return {
      id: `wechat-work-${Date.now()}`,
      channel: 'wechat-work',
      content: data.content as string || JSON.stringify(data),
      timestamp: new Date(),
      metadata: data,
    }
  }

  private processWechat(data: Record<string, unknown>): ChannelMessage | null {
    return {
      id: `wechat-${Date.now()}`,
      channel: 'wechat',
      content: data.content as string || JSON.stringify(data),
      timestamp: new Date(),
      metadata: data,
    }
  }

  private getResponse(platform: string, callback: PlatformCallback): Record<string, unknown> {
    switch (platform) {
      case 'dingtalk':
        return { errcode: 0, errmsg: 'success' }
      case 'feishu':
        return { code: 0, msg: 'success' }
      case 'wechat-work':
        return { errcode: 0, errmsg: 'success' }
      default:
        return { success: true }
    }
  }

  destroy(): void {
    if (this.running) {
      this.stop()
    }
    this.handlers.clear()
  }
}
