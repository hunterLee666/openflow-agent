console.error('index.ts 开始加载...')

import { createRoot } from './core/renderer'
console.error('导入 createRoot 完成')

import React from 'react'
console.error('导入 React 完成')

import { OpenFlowApp } from './components/OpenFlowApp'
console.error('导入 OpenFlowApp 完成')

import { WebSocketClient } from './core/transport'
import { TransportMessage } from './core/transport'
console.error('导入 WebSocketClient 完成')

import { Message } from './components/ChatArea'
console.error('导入 ChatArea 完成')

import Input from './core/input'
console.error('导入 Input 完成')

console.error('所有导入完成')

const WS_URL = process.argv[2] || 'ws://localhost:8765'
const PROVIDER = process.argv[3] || 'Bailian'
const MODEL = process.argv[4] || 'qwen2.5-vl-3b-instruct'
const BASE_URL = process.argv[5] || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

let messages: Message[] = []
let status: 'idle' | 'running' | 'error' = 'idle'
let tokenUsed = 0
let latency = 0
let inputValue = ''
const sessionId = `session-${Date.now()}`
const tokenTotal = 128000

type TabType = 'model' | 'provider' | 'skills' | 'commands' | 'history' | 'operations' | 'settings' | 'shortcuts'
let selectedTab: TabType = 'model'
let selectedIndex = 0

const input = new Input()

function render() {
  try {
    console.error('[RENDER] 开始渲染...')
    const root = createRoot()
    console.error('[RENDER] 创建 root 完成')
    
    const app = React.createElement(OpenFlowApp, {
      messages,
      provider: PROVIDER,
      model: MODEL,
      baseUrl: BASE_URL,
      latency,
      tokenUsed,
      tokenTotal,
      session: sessionId,
      status,
      inputValue,
      selectedTab,
      selectedIndex,
      onSend: (content: string) => {
        if (!content.trim()) return
        
        messages = [...messages, {
          id: `user-${Date.now()}`,
          role: 'user',
          content,
          timestamp: new Date()
        }]
        inputValue = ''
        status = 'running'
        render()
        
        const request: TransportMessage = {
          id: `req-${Date.now()}`,
          type: 'request',
          channel: 'chat',
          payload: {
            content,
            provider: PROVIDER,
            model: MODEL,
            baseUrl: BASE_URL,
            sessionId
          },
          timestamp: new Date()
        }
        
        client.send(request).catch(err => {
          console.error('Failed to send message:', err)
          status = 'error'
          render()
        })
      }
    })
    
    console.error('[RENDER] 创建 app 完成')
    root.render(app, { fullscreen: true, print: false })
    console.error('[RENDER] root.render 完成')
  } catch (err) {
    console.error('[RENDER] 渲染错误:', err)
  }
}

console.error('开始连接 WebSocket...')

const client = new WebSocketClient(WS_URL, {
  onConnect: () => {
    console.error('Connected to backend')
    status = 'idle'
    render()
  },
  onDisconnect: () => {
    console.error('Disconnected from backend')
    status = 'error'
    render()
  },
  onError: (error) => {
    console.error('WebSocket error:', error)
    status = 'error'
    render()
  },
  onMessage: (msg: TransportMessage) => {
    if (msg.type === 'response' && msg.channel === 'chat') {
      const payload = msg.payload as any
      messages = [...messages, {
        id: msg.id,
        role: payload.role || 'assistant',
        content: payload.content || '',
        timestamp: new Date()
      }]
      tokenUsed = payload.tokenUsed || 0
      latency = payload.latency || 0
      status = 'idle'
      render()
    }
  }
})

console.error('正在连接 WebSocket...')
client.connect().then(() => {
  console.error('WebSocket 连接成功')
  status = 'idle'
  render()
}).catch(err => {
  console.error('WebSocket 连接失败:', err.message || err)
  console.error('仍然渲染界面...')
  status = 'error'
  render()
})

const TABS: TabType[] = ['model', 'provider', 'skills', 'commands', 'history', 'operations', 'settings', 'shortcuts']

console.error('[INPUT] 注册输入事件监听器...')
input.on((key: string) => {
  console.error(`[INPUT] 收到按键: ${JSON.stringify(key)}`)
  if (key === '\r' || key === '\n') {
    if (inputValue.trim()) {
      const content = inputValue
      messages = [...messages, {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date()
      }]
      inputValue = ''
      status = 'running'
      render()
      
      const request: TransportMessage = {
        id: `req-${Date.now()}`,
        type: 'request',
        channel: 'chat',
        payload: {
          content,
          provider: PROVIDER,
          model: MODEL,
          baseUrl: BASE_URL,
          sessionId
        },
        timestamp: new Date()
      }
      
      client.send(request).catch(err => {
        console.error('Failed to send message:', err)
        status = 'error'
        render()
      })
    }
  } else if (key === '\x7f' || key === '\b') {
    inputValue = inputValue.slice(0, -1)
    render()
  } else if (key === '\x03') {
    console.error('[INPUT] 收到 Ctrl+C, 退出')
    client.disconnect().catch(() => {})
    process.exit(0)
  } else if (key === '\x1b[A') {
    const idx = TABS.indexOf(selectedTab)
    selectedTab = TABS[idx > 0 ? idx - 1 : TABS.length - 1]
    selectedIndex = 0
    render()
  } else if (key === '\x1b[B') {
    const idx = TABS.indexOf(selectedTab)
    selectedTab = TABS[(idx + 1) % TABS.length]
    selectedIndex = 0
    render()
  } else if (key.length === 1 && key >= ' ') {
    inputValue += key
    render()
  }
})

console.error('[INPUT] 恢复 stdin 流...')
process.stdin.resume()
console.error('[INPUT] stdin 已恢复')

process.on('SIGINT', () => {
  console.error('[SIGINT] 收到 SIGINT 信号')
  client.disconnect().catch(() => {})
  process.exit(0)
})

console.error('[APP] 应用启动完成，等待用户输入...')
