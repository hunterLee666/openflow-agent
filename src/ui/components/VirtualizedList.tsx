import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from 'ink'

export interface VirtualizedMessage {
  id: string
  height: number
  content: React.ReactNode
}

export interface VirtualizedListProps {
  items: VirtualizedMessage[]
  containerHeight: number
  overscanCount?: number
  estimatedItemHeight?: number
  width?: number | string
  onScrollToBottom?: () => void
  stickToBottom?: boolean
}

interface VisibleRange {
  startIndex: number
  endIndex: number
  offsetY: number
}

const DEFAULT_OVERSCAN = 5
const DEFAULT_ITEM_HEIGHT = 80

function calculateVisibleRange(
  scrollTop: number,
  containerHeight: number,
  items: VirtualizedMessage[],
  overscan: number,
): VisibleRange {
  let currentOffset = 0
  let startIndex = 0
  let endIndex = items.length - 1

  for (let i = 0; i < items.length; i++) {
    const itemHeight = items[i].height || DEFAULT_ITEM_HEIGHT
    if (currentOffset + itemHeight > scrollTop) {
      startIndex = Math.max(0, i - overscan)
      break
    }
    currentOffset += itemHeight
  }

  currentOffset = 0
  for (let i = 0; i < startIndex; i++) {
    currentOffset += items[i].height || DEFAULT_ITEM_HEIGHT
  }

  const visibleHeight = containerHeight
  let accumulatedHeight = 0
  for (let i = startIndex; i < items.length; i++) {
    accumulatedHeight += items[i].height || DEFAULT_ITEM_HEIGHT
    if (accumulatedHeight > visibleHeight + overscan * DEFAULT_ITEM_HEIGHT) {
      endIndex = i
      break
    }
  }

  return { startIndex, endIndex, offsetY: currentOffset }
}

function getTotalHeight(items: VirtualizedMessage[]): number {
  return items.reduce((sum, item) => sum + (item.height || DEFAULT_ITEM_HEIGHT), 0)
}

const VirtualizedListItem = memo(function VirtualizedListItem({
  item,
  style,
}: {
  item: VirtualizedMessage
  style: React.CSSProperties
}) {
  return (
    <Box style={style} width="100%">
      {item.content}
    </Box>
  )
})

export function VirtualizedList({
  items,
  containerHeight,
  overscanCount = DEFAULT_OVERSCAN,
  estimatedItemHeight = DEFAULT_ITEM_HEIGHT,
  width = '100%',
  onScrollToBottom,
  stickToBottom = true,
}: VirtualizedListProps): React.ReactNode {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<number>(0)
  const lastItemRef = useRef<string | null>(null)
  const isUserScrolling = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const totalHeight = useMemo(() => getTotalHeight(items), [items])

  const visibleRange = useMemo(
    () => calculateVisibleRange(scrollTop, containerHeight, items, overscanCount),
    [scrollTop, containerHeight, items, overscanCount],
  )

  const visibleItems = useMemo(() => {
    const result: Array<{ item: VirtualizedMessage; style: React.CSSProperties; index: number }> = []
    let currentOffset = visibleRange.offsetY

    for (let i = visibleRange.startIndex; i <= visibleRange.endIndex && i < items.length; i++) {
      const item = items[i]
      const height = item.height || estimatedItemHeight
      result.push({
        item,
        index: i,
        style: {
          position: 'absolute',
          top: currentOffset,
          left: 0,
          right: 0,
          height,
          width: '100%',
        },
      })
      currentOffset += height
    }

    return result
  }, [items, visibleRange, estimatedItemHeight])

  useEffect(() => {
    if (stickToBottom && items.length > 0 && !isUserScrolling.current) {
      const lastItem = items[items.length - 1]
      if (lastItem.id !== lastItemRef.current) {
        lastItemRef.current = lastItem.id
        const newScrollTop = Math.max(0, totalHeight - containerHeight)
        setScrollTop(newScrollTop)
        onScrollToBottom?.()
      }
    }
  }, [items, totalHeight, containerHeight, stickToBottom, onScrollToBottom])

  const handleScroll = useCallback((delta: number) => {
    isUserScrolling.current = true
    setScrollTop(prev => {
      const newScrollTop = Math.max(0, Math.min(prev + delta, totalHeight - containerHeight))
      return newScrollTop
    })

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrolling.current = false
    }, 150)
  }, [totalHeight, containerHeight])

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  return (
    <Box
      flexDirection="column"
      height={containerHeight}
      width={width}
      overflow="hidden"
    >
      <Box
        flexDirection="column"
        height={containerHeight}
        width={width}
        position="relative"
        ref={containerRef as any}
      >
        {visibleItems.map(({ item, style, index }) => (
          <VirtualizedListItem key={item.id} item={item} style={style} />
        ))}
      </Box>
    </Box>
  )
}

export function useVirtualizedMessages<T extends { id: string }>(
  messages: T[],
  renderItem: (message: T, index: number) => React.ReactNode,
  estimateHeight?: (message: T) => number,
): VirtualizedMessage[] {
  return useMemo(() => {
    return messages.map((message, index) => ({
      id: message.id,
      height: estimateHeight?.(message) ?? DEFAULT_ITEM_HEIGHT,
      content: renderItem(message, index),
    }))
  }, [messages, renderItem, estimateHeight])
}

export function createVirtualizedMessage(
  id: string,
  content: React.ReactNode,
  height?: number,
): VirtualizedMessage {
  return {
    id,
    content,
    height: height ?? DEFAULT_ITEM_HEIGHT,
  }
}

export const MESSAGE_HEIGHT_ESTIMATES = {
  short: 40,
  medium: 80,
  long: 150,
  toolResult: 120,
  codeBlock: 200,
  image: 300,
}

export function estimateMessageHeight(content: string): number {
  const lines = content.split('\n').length
  const hasCodeBlock = content.includes('```')
  const hasImage = content.includes('![') || content.includes('<img')

  if (hasImage) return MESSAGE_HEIGHT_ESTIMATES.image
  if (hasCodeBlock) return MESSAGE_HEIGHT_ESTIMATES.codeBlock
  if (lines > 20) return MESSAGE_HEIGHT_ESTIMATES.long
  if (lines > 5) return MESSAGE_HEIGHT_ESTIMATES.medium
  return MESSAGE_HEIGHT_ESTIMATES.short
}
