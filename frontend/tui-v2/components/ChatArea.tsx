import React from 'react'
import Text from './Text'
import { Box } from './Box'
import StreamingText from './ai/StreamingText'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: Date
  isStreaming?: boolean
}

export interface ChatAreaProps {
  messages: Message[]
  inputValue: string
  onSend?: (message: string) => void
}

export function ChatArea({ messages, inputValue }: ChatAreaProps): React.ReactElement {
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Box, { flexDirection: 'column' },
      ...messages.map((msg) =>
        React.createElement(Box, {
          key: msg.id,
          flexDirection: 'column',
          paddingX: 1,
          paddingY: 0
        },
          React.createElement(Text, {
            color: msg.role === 'user' ? 'BrightMagenta' : 'BrightCyan',
            bold: true,
            block: true
          }, msg.role === 'user' ? '👤 用户' : '🤖 助手'),
          msg.isStreaming
            ? React.createElement(StreamingText, {
                text: msg.content,
                color: 'BrightWhite',
                interval: 10,
                showCursorWhenDone: true
              })
            : React.createElement(Text, { color: 'BrightWhite', block: true }, msg.content)
        )
      )
    ),
    React.createElement(Box, { flexDirection: 'row', paddingX: 1, paddingY: 1 },
      React.createElement(Text, { color: 'BrightMagenta', bold: true }, '❯ '),
      React.createElement(Text, { color: 'BrightWhite' }, inputValue || '输入消息... (Ctrl+C 退出)')
    )
  )
}

export default ChatArea
