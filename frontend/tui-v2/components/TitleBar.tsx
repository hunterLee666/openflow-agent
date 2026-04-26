import React from 'react'
import Text from './Text'
import { Box } from './Box'

export interface TitleBarProps {
  version?: string
}

export function TitleBar({ version = 'v2.0.0' }: TitleBarProps): React.ReactElement {
  return React.createElement(Box, { flexDirection: 'row', paddingX: 1, paddingY: 0 },
    React.createElement(Text, { color: 'BrightMagenta', bold: true }, '◆ 政颐制造 '),
    React.createElement(Text, { color: 'BrightCyan' }, 'OpenFlow TUI'),
    React.createElement(Text, { color: 'BrightBlack' }, ` ${version}`),
    React.createElement(Text, { color: 'BrightBlack', dim: true }, ' - 高性能 AI 终端')
  )
}

export default TitleBar
