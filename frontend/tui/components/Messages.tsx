import React, { type ReactNode, useCallback, useRef, useState } from 'react'
import { Box } from './Box.js'
import { MessageComponent, type Message } from './Message.js'
import { ScrollBox, type ScrollBoxRef } from './ScrollBox.js'

export interface MessagesProps {
  messages: Message[]
  maxWidth?: number
  showTimestamps?: boolean
  scrollToBottom?: boolean
}

export function Messages({
  messages,
  maxWidth = 100,
  showTimestamps = true,
  scrollToBottom = true,
}: MessagesProps): ReactNode {
  const scrollBoxRef = useRef<ScrollBoxRef | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (scrollToBottom && scrollBoxRef.current) {
      scrollBoxRef.current.scrollToBottom()
    }
  }, [messages, scrollToBottom])

  if (messages.length === 0) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
        <MessageComponent
          message={{
            id: 'welcome',
            role: 'assistant',
            content: {
              type: 'text',
              text: 'Welcome! How can I help you today?',
            },
            timestamp: Date.now(),
          }}
          showTimestamp={false}
          maxWidth={maxWidth}
        />
      </Box>
    )
  }

  return (
    <ScrollBox
      ref={scrollBoxRef}
      flexGrow={1}
      overflowY="auto"
      autoScrollToBottom={scrollToBottom}
    >
      <Box flexDirection="column" padding={1} flexGrow={1} ref={containerRef as React.RefObject<HTMLDivElement>}>
        {messages.map((message, index) => (
          <MessageComponent
            key={message.id || index}
            message={message}
            showTimestamp={showTimestamps}
            maxWidth={maxWidth}
          />
        ))}
      </Box>
    </ScrollBox>
  )
}

export interface MessageInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel?: () => void
  placeholder?: string
  disabled?: boolean
  multiline?: boolean
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = 'Type a message...',
  disabled = false,
  multiline = false,
}: MessageInputProps): ReactNode {
  const [isComposing, setIsComposing] = useState(false)

  const handleKeyDown = useCallback(
    (key: string, modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }) => {
      if (isComposing) return

      if (key === 'Enter' && !modifiers.shift && !modifiers.ctrl && !modifiers.alt && !modifiers.meta) {
        if (!multiline || modifiers.shift) {
          onSubmit()
        }
        return
      }

      if (key === 'Escape') {
        onCancel?.()
        return
      }
    },
    [isComposing, multiline, onCancel, onSubmit],
  )

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      padding={1}
    >
      <Box>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'inherit',
            fontFamily: 'inherit',
            fontSize: 'inherit',
          }}
        />
      </Box>
    </Box>
  )
}
