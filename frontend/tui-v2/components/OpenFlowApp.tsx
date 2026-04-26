import React from 'react'
import { AppLayout, Sidebar, ChatContainer, StatusBarLayout, TitleBarLayout } from './layout'
import { OpenFlowSidebar } from './OpenFlowSidebar'
import { ChatArea } from './ChatArea'
import { StatusBar } from './StatusBar'
import { TitleBar } from './TitleBar'
import { Message } from './ChatArea'

type TabType = 'model' | 'provider' | 'skills' | 'commands' | 'history' | 'operations' | 'settings' | 'shortcuts'

export interface OpenFlowAppProps {
  messages: Message[]
  inputValue: string
  provider: string
  model: string
  baseUrl: string
  latency: number
  tokenUsed: number
  tokenTotal: number
  session: string
  status: 'idle' | 'running' | 'error'
  selectedTab?: TabType
  selectedIndex?: number
  onSend?: (message: string) => void
}

export function OpenFlowApp({
  messages,
  inputValue,
  provider,
  model,
  baseUrl,
  latency,
  tokenUsed,
  tokenTotal,
  session,
  status,
  selectedTab = 'model',
  selectedIndex = 0,
  onSend
}: OpenFlowAppProps): React.ReactElement {
  return React.createElement(AppLayout, {
    titleBar: React.createElement(TitleBarLayout, {},
      React.createElement(TitleBar, {})
    ),
    sidebar: React.createElement(Sidebar, { width: 45 },
      React.createElement(OpenFlowSidebar, {
        provider,
        model,
        baseUrl,
        latency,
        tokenUsed,
        tokenTotal,
        selectedTab,
        selectedIndex
      })
    ),
    statusBar: React.createElement(StatusBarLayout, {},
      React.createElement(StatusBar, {
        provider,
        model,
        session,
        tokenUsed,
        tokenTotal,
        status
      })
    )
  },
    React.createElement(ChatContainer, {},
      React.createElement(ChatArea, { messages, inputValue, onSend })
    )
  )
}

export default OpenFlowApp
