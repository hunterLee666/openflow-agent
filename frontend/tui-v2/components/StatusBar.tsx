import React from 'react'
import Text from './Text'
import { Box } from './Box'

export interface StatusBarProps {
  provider: string
  model: string
  session: string
  tokenUsed: number
  tokenTotal: number
  status: 'idle' | 'running' | 'error'
}

export function StatusBar({
  provider,
  model,
  session,
  tokenUsed,
  tokenTotal,
  status
}: StatusBarProps): React.ReactElement {
  const statusColor = status === 'idle' ? 'BrightGreen' : status === 'running' ? 'BrightYellow' : 'BrightRed'
  const statusText = status === 'idle' ? '就绪' : status === 'running' ? '运行中' : '错误'

  return React.createElement(Box, { flexDirection: 'row', paddingX: 1, paddingY: 0 },
    React.createElement(Text, { color: statusColor, bold: true }, '● '),
    React.createElement(Text, { color: 'BrightWhite' }, statusText),
    React.createElement(Text, { color: 'BrightBlack' }, ' │ '),
    React.createElement(Text, { color: 'BrightMagenta' }, provider),
    React.createElement(Text, { color: 'BrightBlack' }, '/'),
    React.createElement(Text, { color: 'BrightWhite' }, model),
    React.createElement(Text, { color: 'BrightBlack' }, ' │ 会话: '),
    React.createElement(Text, { color: 'BrightWhite' }, session),
    React.createElement(Text, { color: 'BrightBlack' }, ' │ Token: '),
    React.createElement(Text, { color: 'BrightMagenta' }, String(tokenUsed)),
    React.createElement(Text, { color: 'BrightBlack' }, `/${tokenTotal}`)
  )
}

export default StatusBar
