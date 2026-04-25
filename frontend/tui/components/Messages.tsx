import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box } from './Box.js'
import { MessageComponent, type Message } from './Message.js'
import { ScrollBox, type ScrollBoxRef } from './ScrollBox.js'
import { VirtualList, type VirtualListItem } from './VirtualList.js'

const VIRTUAL_SCROLL_THRESHOLD = 50
const DEFAULT_MESSAGE_HEIGHT = 4
const VISIBLE_HEIGHT = 20

export interface MessagesProps {
  messages: Message[]
  maxWidth?: number
  showTimestamps?: boolean
  scrollToBottom?: boolean
  enableVirtualScroll?: boolean
}

export function Messages({
  messages,
  maxWidth = 100,
  showTimestamps = true,
  scrollToBottom = true,
  enableVirtualScroll = true,
}: MessagesProps): ReactNode {
  const scrollBoxRef = useRef<ScrollBoxRef | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)
  const [autoScroll, setAutoScroll] = useState(scrollToBottom)

  useEffect(() => {
    if (autoScroll && scrollBoxRef.current) {
      scrollBoxRef.current.scrollToBottom()
    }
  }, [messages.length, autoScroll])

  const shouldUseVirtualScroll = enableVirtualScroll && messages.length > VIRTUAL_SCROLL_THRESHOLD

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

  if (shouldUseVirtualScroll) {
    const virtualItems: VirtualListItem<Message>[] = messages.map((msg, index) => ({
      key: msg.id || `msg-${index}`,
      data: msg,
      size: DEFAULT_MESSAGE_HEIGHT,
    }))

    return (
      <Box flexDirection="column" flexGrow={1} overflowY="auto">
        <VirtualList
          items={virtualItems}
          renderItem={(msg, index) => (
            <MessageComponent
              key={msg.id || index}
              message={msg}
              showTimestamp={showTimestamps}
              maxWidth={maxWidth}
            />
          )}
          estimatedItemSize={DEFAULT_MESSAGE_HEIGHT}
          overscan={5}
          height={VISIBLE_HEIGHT}
          autoScrollToBottom={autoScroll}
          onScroll={(scrollTop, scrollHeight, clientHeight) => {
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 10
            setAutoScroll(isNearBottom)
          }}
        />
      </Box>
    )
  }

  return (
    <ScrollBox
      ref={scrollBoxRef}
      flexGrow={1}
      overflowY="auto"
      autoScrollToBottom={autoScroll}
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
