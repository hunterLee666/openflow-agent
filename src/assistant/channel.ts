import { nanoid } from 'nanoid'
import type { ChannelMessage, ChannelConfig } from './types'

type MessageHandler = (message: ChannelMessage) => Promise<void> | void

export class JarvisChannel {
  private channels: Map<string, ChannelConfig> = new Map()
  private handlers: MessageHandler[] = []
  private messageQueue: ChannelMessage[] = []
  private maxQueueSize: number = 1000

  constructor() {}

  registerChannel(config: ChannelConfig): void {
    this.channels.set(config.type, config)
  }

  removeChannel(type: string): void {
    this.channels.delete(type)
  }

  getChannel(type: string): ChannelConfig | undefined {
    return this.channels.get(type)
  }

  getAllChannels(): ChannelConfig[] {
    return Array.from(this.channels.values())
  }

  getEnabledChannels(): ChannelConfig[] {
    return this.getAllChannels().filter(c => c.enabled)
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const index = this.handlers.indexOf(handler)
      if (index > -1) {
        this.handlers.splice(index, 1)
      }
    }
  }

  async receiveMessage(
    channel: string,
    content: string,
    sender?: string,
    metadata?: Record<string, unknown>,
  ): Promise<ChannelMessage> {
    const message: ChannelMessage = {
      id: nanoid(),
      channel,
      sender,
      content,
      timestamp: new Date(),
      metadata,
    }

    this.messageQueue.push(message)
    if (this.messageQueue.length > this.maxQueueSize) {
      this.messageQueue = this.messageQueue.slice(-this.maxQueueSize)
    }

    for (const handler of this.handlers) {
      try {
        await handler(message)
      } catch (error) {
        console.error(`Message handler failed for channel ${channel}:`, error)
      }
    }

    return message
  }

  async sendMessage(
    channel: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const config = this.channels.get(channel)
    if (!config || !config.enabled) {
      throw new Error(`Channel ${channel} is not registered or enabled`)
    }

    switch (config.type) {
      case 'stdio':
        console.log(`[${channel}] ${content}`)
        break
      case 'webhook':
        await this.sendToWebhook(config.config.url as string, content, metadata)
        break
      case 'wechat':
        await this.sendToWechat(config.config, content, metadata)
        break
      case 'wechat-work':
        await this.sendToWechatWork(config.config, content, metadata)
        break
      case 'dingtalk':
        await this.sendToDingtalk(config.config, content, metadata)
        break
      case 'feishu':
        await this.sendToFeishu(config.config, content, metadata)
        break
      case 'discord':
      case 'telegram':
      case 'slack':
        console.log(`[${config.type}] ${content}`)
        break
      default:
        console.log(`[${channel}] ${content}`)
    }
  }

  private async sendToWebhook(
    url: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, metadata, timestamp: new Date().toISOString() }),
      })
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status}`)
      }
    } catch (error) {
      console.error('Webhook send failed:', error)
      throw error
    }
  }

  private async sendToWechat(
    config: Record<string, unknown>,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const webhookUrl = config.webhookUrl as string
    if (!webhookUrl) {
      throw new Error('Wechat webhookUrl is required')
    }
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content },
        }),
      })
      if (!response.ok) {
        throw new Error(`Wechat send failed: ${response.status}`)
      }
    } catch (error) {
      console.error('Wechat send failed:', error)
      throw error
    }
  }

  private async sendToWechatWork(
    config: Record<string, unknown>,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const webhookUrl = config.webhookUrl as string
    if (!webhookUrl) {
      throw new Error('Wechat Work webhookUrl is required')
    }
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { content },
        }),
      })
      if (!response.ok) {
        throw new Error(`Wechat Work send failed: ${response.status}`)
      }
    } catch (error) {
      console.error('Wechat Work send failed:', error)
      throw error
    }
  }

  private async sendToDingtalk(
    config: Record<string, unknown>,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const webhookUrl = config.webhookUrl as string
    const secret = config.secret as string | undefined
    
    if (!webhookUrl) {
      throw new Error('Dingtalk webhookUrl is required')
    }

    let url = webhookUrl
    if (secret) {
      const timestamp = Date.now()
      const sign = await this.generateDingtalkSign(timestamp, secret)
      url = `${webhookUrl}&timestamp=${timestamp}&sign=${sign}`
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content },
        }),
      })
      if (!response.ok) {
        throw new Error(`Dingtalk send failed: ${response.status}`)
      }
    } catch (error) {
      console.error('Dingtalk send failed:', error)
      throw error
    }
  }

  private async generateDingtalkSign(timestamp: number, secret: string): Promise<string> {
    const message = `${timestamp}\n${secret}`
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const msgData = encoder.encode(message)
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    
    const signature = await crypto.subtle.sign('HMAC', key, msgData)
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    return encodeURIComponent(signatureBase64)
  }

  private async sendToFeishu(
    config: Record<string, unknown>,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const webhookUrl = config.webhookUrl as string
    if (!webhookUrl) {
      throw new Error('Feishu webhookUrl is required')
    }
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: { text: content },
        }),
      })
      if (!response.ok) {
        throw new Error(`Feishu send failed: ${response.status}`)
      }
    } catch (error) {
      console.error('Feishu send failed:', error)
      throw error
    }
  }

  getPendingMessages(count: number = 100): ChannelMessage[] {
    return this.messageQueue.slice(-count)
  }

  clearMessages(): void {
    this.messageQueue = []
  }

  destroy(): void {
    this.handlers = []
    this.messageQueue = []
    this.channels.clear()
  }
}
