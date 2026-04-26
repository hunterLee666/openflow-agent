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

// 只创建一个 root 实例
const root = createRoot()
console.error('[INIT] root 创建完成')

function render() {
  try {
    console.error('[RENDER] 开始渲染...')
    
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

// 保持进程运行
process.stdin.resume()

// 处理退出信号
process.on('SIGINT', () => {
  console.error('收到 SIGINT 信号')
  root.terminate(0)
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.error('收到 SIGTERM 信号')
  root.terminate(0)
  process.exit(0)
})

console.error('进程已保持运行状态')

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
    console.error(`选择了: Tab=${selectedTab}, Index=${selectedIndex}`)
    return
  }
  
  // 其他按键 - 忽略
})
