import React from 'react'
import Text from './Text'
import { Box } from './Box'

export interface AppLayoutProps {
  children?: React.ReactNode
  sidebar?: React.ReactNode
  statusBar?: React.ReactNode
  titleBar?: React.ReactNode
}

export function AppLayout({ children, sidebar, statusBar, titleBar }: AppLayoutProps): React.ReactElement {
  const elements: React.ReactNode[] = []
  
  if (titleBar) {
    elements.push(titleBar)
  }
  
  if (sidebar || children) {
    const rowElements: React.ReactNode[] = []
    if (sidebar) {
      rowElements.push(sidebar)
    }
    if (children) {
      rowElements.push(children)
    }
    elements.push(React.createElement(Box, { key: 'main', flexDirection: 'row' }, ...rowElements))
  }
  
  if (statusBar) {
    elements.push(statusBar)
  }
  
  return React.createElement(Box, { flexDirection: 'column' }, ...elements)
}

export interface SidebarProps {
  children?: React.ReactNode
  width?: number
}

export function Sidebar({ children, width = 35 }: SidebarProps): React.ReactElement {
  return React.createElement(Box, {
    flexDirection: 'column',
    width: width
  }, children)
}

export interface ChatContainerProps {
  children?: React.ReactNode
}

export function ChatContainer({ children }: ChatContainerProps): React.ReactElement {
  return React.createElement(Box, { flexDirection: 'column' }, children)
}

export interface StatusBarLayoutProps {
  children?: React.ReactNode
}

export function StatusBarLayout({ children }: StatusBarLayoutProps): React.ReactElement {
  return React.createElement(Box, {
    flexDirection: 'row',
    paddingX: 1,
    paddingY: 0
  }, children)
}

export interface TitleBarLayoutProps {
  children?: React.ReactNode
}

export function TitleBarLayout({ children }: TitleBarLayoutProps): React.ReactElement {
  return React.createElement(Box, {
    flexDirection: 'row',
    paddingX: 1,
    paddingY: 0
  }, children)
}
