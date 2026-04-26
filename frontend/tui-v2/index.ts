import { createRoot } from './core/renderer'

import React from 'react'

import { OpenFlowApp } from './components/OpenFlowApp'

import { WebSocketClient } from './core/transport'
import { TransportMessage } from './core/transport'

import { Message } from './components/ChatArea'

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

// 只创建一个 root 实例
const root = createRoot()

function render() {
  try {
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
    
    root.render(app, { fullscreen: true, print: false })
  } catch (err) {
    // 渲染错误时静默处理
  }
}

const client = new WebSocketClient(WS_URL, {
  onConnect: () => {
    status = 'idle'
    render()
  },
  onDisconnect: () => {
    status = 'error'
    render()
  },
  onError: (error) => {
    status = 'error'
    render()
  },
  onMessage: (msg: TransportMessage) => {
    if (msg.type === 'response' && msg.channel === 'chat') {
      const payload = msg.payload as any
      
      // 检查是否是流式输出的中间消息
      if (payload.isStreaming) {
        // 更新最后一条助手消息
        const lastMsg = messages[messages.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          messages = [
            ...messages.slice(0, -1),
            { ...lastMsg, content: payload.content }
          ]
        } else {
          // 创建新的流式消息
          messages = [...messages, {
            id: msg.id,
            role: 'assistant',
            content: payload.content || '',
            timestamp: new Date(),
            isStreaming: true
          }]
        }
      } else {
        // 最终消息
        const lastMsg = messages[messages.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          // 更新最后一条流式消息为最终消息
          messages = [
            ...messages.slice(0, -1),
            { ...lastMsg, content: payload.content || '', isStreaming: false }
          ]
        } else {
          messages = [...messages, {
            id: msg.id,
            role: payload.role || 'assistant',
            content: payload.content || '',
            timestamp: new Date(),
            isStreaming: false
          }]
        }
      }
      
      tokenUsed = payload.tokenUsed || 0
      latency = payload.latency || 0
      status = payload.isStreaming ? 'running' : 'idle'
      render()
    }
  }
})

client.connect().then(() => {
  status = 'idle'
  render()
}).catch(err => {
  status = 'error'
  render()
})

// 保持进程运行
process.stdin.resume()

// 处理退出信号
process.on('SIGINT', () => {
  root.terminate(0)
  process.exit(0)
})

process.on('SIGTERM', () => {
  root.terminate(0)
  process.exit(0)
})

// 添加键盘事件处理
const TABS: TabType[] = ['model', 'provider', 'skills', 'commands', 'history', 'operations', 'settings', 'shortcuts']

process.stdin.on('data', (data: Buffer) => {
  const key = data.toString()
  
  // Ctrl+C 退出
  if (key === '\x03') {
    root.terminate(0)
    process.exit(0)
  }
  
  // Ctrl+Q 退出
  if (key === '\x11') {
    root.terminate(0)
    process.exit(0)
  }
  
  // 上箭头 - 切换上一个 Tab
  if (key === '\x1b[A' || key === '\x1bOA') {
    const currentIndex = TABS.indexOf(selectedTab)
    const newIndex = (currentIndex - 1 + TABS.length) % TABS.length
    selectedTab = TABS[newIndex]
    selectedIndex = 0
    render()
    return
  }
  
  // 下箭头 - 切换下一个 Tab
  if (key === '\x1b[B' || key === '\x1bOB') {
    const currentIndex = TABS.indexOf(selectedTab)
    const newIndex = (currentIndex + 1) % TABS.length
    selectedTab = TABS[newIndex]
    selectedIndex = 0
    render()
    return
  }
  
  // 左箭头 - 上一个列表项
  if (key === '\x1b[D' || key === '\x1bOD') {
    selectedIndex = Math.max(0, selectedIndex - 1)
    render()
    return
  }
  
  // 右箭头 - 下一个列表项
  if (key === '\x1b[C' || key === '\x1bOC') {
    selectedIndex = selectedIndex + 1
    render()
    return
  }
  
  // Enter - 确认选择
  if (key === '\r' || key === '\n') {
    return
  }
  
  // 其他按键 - 忽略
})
