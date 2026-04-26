import React from 'react'
import Text from './Text'
import { Box } from './Box'
import { Color } from '../types'

export interface ModelBadgeProps {
  provider: string
  model: string
  status?: 'online' | 'offline' | 'loading'
  latency?: number
  tokenUsed?: number
  tokenTotal?: number
  color?: Color
}

export function ModelBadge({
  provider,
  model,
  status = 'online',
  latency,
  tokenUsed,
  tokenTotal,
  color = 'BrightMagenta'
}: ModelBadgeProps): React.ReactElement {
  const statusIcon = status === 'online' ? '●' : status === 'loading' ? '◉' : '○'
  const statusColor = status === 'online' ? 'BrightGreen' : status === 'loading' ? 'BrightYellow' : 'BrightRed'

  const children: React.ReactNode[] = [
    React.createElement(Text, { color: statusColor, key: 'status' }, statusIcon),
    ' ',
    React.createElement(Text, { color: color, bold: true, key: 'provider' }, provider),
    ' ',
    React.createElement(Text, { color: 'BrightBlack', key: 'separator' }, '|'),
    ' ',
    React.createElement(Text, { color: 'BrightWhite', key: 'model' }, model)
  ]

  if (latency !== undefined) {
    children.push(
      ' ',
      React.createElement(Text, { color: 'BrightBlack', key: 'latency' }, `${latency}ms`)
    )
  }

  if (tokenUsed !== undefined && tokenTotal !== undefined) {
    const percentage = Math.round((tokenUsed / tokenTotal) * 100)
    const tokenColor = percentage > 80 ? 'BrightRed' : percentage > 50 ? 'BrightYellow' : 'BrightGreen'
    
    children.push(
      React.createElement(Text, { block: true, key: 'token-line' },
        React.createElement(Text, { color: 'BrightBlack' }, '  Tokens: '),
        React.createElement(Text, { color: tokenColor }, `${tokenUsed.toLocaleString()}`),
        React.createElement(Text, { color: 'BrightBlack' }, ` / ${tokenTotal.toLocaleString()} (${percentage}%)`)
      )
    )
  }

  return React.createElement(Box, { 
    flexDirection: 'column',
    paddingX: 1,
    paddingY: 0
  }, 
    React.createElement(Text, { block: true }, ...children.filter(c => !React.isValidElement(c) || c.props.block !== true)),
    ...(children.filter(c => React.isValidElement(c) && c.props.block === true) as React.ReactElement[])
  )
}

export default ModelBadge
