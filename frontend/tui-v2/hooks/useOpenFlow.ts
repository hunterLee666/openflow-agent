import { useState, useEffect, useCallback, useRef } from 'react'
import { WebSocketClient } from '../core/transport'
import { TransportMessage } from '../core/transport'
import { Message } from '../components/ChatArea'

export interface UseOpenFlowOptions {
  wsUrl?: string
  provider?: string
  model?: string
  baseUrl?: string
}

export function useOpenFlow({
  wsUrl = 'ws://localhost:8765',
  provider = 'Bailian',
  model = 'qwen2.5-vl-3b-instruct',
  baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
}: UseOpenFlowOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [tokenUsed, setTokenUsed] = useState(0)
  const [latency, setLatency] = useState(0)
  const clientRef = useRef<WebSocketClient | null>(null)
  const sessionId = useRef(`session-${Date.now()}`)

  const tokenTotal = 128000

  useEffect(() => {
    const client = new WebSocketClient(wsUrl, {
      onConnect: () => {
        console.log('Connected to backend')
        setStatus('idle')
      },
      onDisconnect: () => {
        console.log('Disconnected from backend')
        setStatus('error')
      },
      onError: (error) => {
        console.error('WebSocket error:', error)
        setStatus('error')
      },
      onMessage: (msg: TransportMessage) => {
        if (msg.type === 'response' && msg.channel === 'chat') {
          const payload = msg.payload as any
          setMessages(prev => [...prev, {
            id: msg.id,
            role: payload.role || 'assistant',
            content: payload.content || '',
            timestamp: new Date()
          }])
          setTokenUsed(payload.tokenUsed || 0)
          setLatency(payload.latency || 0)
          setStatus('idle')
        }
      }
    })

    clientRef.current = client
    client.connect().catch(err => {
      console.error('Failed to connect:', err)
      setStatus('error')
    })

    return () => {
      client.disconnect().catch(() => {})
    }
  }, [wsUrl])

  const sendMessage = useCallback((content: string) => {
    if (!clientRef.current?.isConnected()) return

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setStatus('running')

    const request: TransportMessage = {
      id: `req-${Date.now()}`,
      type: 'request',
      channel: 'chat',
      payload: {
        content,
        provider,
        model,
        baseUrl,
        sessionId: sessionId.current
      },
      timestamp: new Date()
    }

    clientRef.current.send(request).catch(err => {
      console.error('Failed to send message:', err)
      setStatus('error')
    })
  }, [provider, model, baseUrl])

  return {
    messages,
    status,
    tokenUsed,
    tokenTotal,
    latency,
    provider,
    model,
    baseUrl,
    session: sessionId.current,
    sendMessage
  }
}
