import React from 'react'
import Text from '../../components/Text'

type Color =
  | number
  | string
  | 'Black'
  | 'Red'
  | 'Green'
  | 'Yellow'
  | 'Blue'
  | 'Magenta'
  | 'Cyan'
  | 'White'
  | 'BrightBlack'
  | 'BrightRed'
  | 'BrightGreen'
  | 'BrightYellow'
  | 'BrightBlue'
  | 'BrightMagenta'
  | 'BrightCyan'
  | 'BrightWhite'

export type MessageRole = 'assistant' | 'system' | 'tool' | 'user'

export interface MessageBubbleProps {
  children: React.ReactNode
  role?: MessageRole
  color?: Color
  flat?: boolean
  label?: string
  meta?: string
}

const ROLE_CONFIG: Record<MessageRole, { color: Color; icon: string }> = {
  assistant: { color: 'BrightBlue', icon: '' },
  system: { color: 'BrightBlack', icon: '' },
  tool: { color: 'BrightMagenta', icon: '' },
  user: { color: 'BrightGreen', icon: '' },
}

export default function MessageBubble({
  children,
  color,
  flat = false,
  label,
  meta,
  role = 'assistant',
}: MessageBubbleProps): React.ReactElement {
  const preset = ROLE_CONFIG[role]
  const accent = color ?? preset.color

  return React.createElement(
    Text,
    { block: true },
    React.createElement(
      Text,
      { block: true },
      label
        ? React.createElement(Text, { color: accent, bold: true }, label)
        : null,
      meta
        ? React.createElement(Text, { dim: true }, ` ${meta}`)
        : null
    ),
    flat
      ? React.createElement(
          Text,
          { color: accent, block: true },
          `│ ${typeof children === 'string' ? children : ''}`
        )
      : React.createElement(
          Text,
          { color: accent, block: true },
          typeof children === 'string' ? children : ''
        )
  )
}
