import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Box } from './Box.js'
import { Text } from './Text.js'
import { z } from 'zod'

export const VirtualListItemSchema = <T extends z.ZodTypeAny>(valueSchema: T) => z.object({
  key: z.string(),
  data: valueSchema,
  size: z.number(),
})
export type VirtualListItem<T> = z.infer<ReturnType<typeof VirtualListItemSchema<z.ZodType<T>>>>

export const VirtualListPropsSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  items: z.array(VirtualListItemSchema(itemSchema)),
  renderItem: z.function().args(itemSchema, z.number()).returns(z.any()),
  estimatedItemSize: z.number().optional(),
  overscan: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  onScroll: z.function().args(z.number(), z.number(), z.number()).returns(z.void()).optional(),
  scrollToIndex: z.number().optional(),
  autoScrollToBottom: z.boolean().optional(),
})
export type VirtualListProps<T> = z.infer<ReturnType<typeof VirtualListPropsSchema<z.ZodType<T>>>>

interface VirtualListState {
  scrollTop: number
  containerHeight: number
  items: VirtualListItem<unknown>[]
}

export function VirtualList<T>({
  items,
  renderItem,
  estimatedItemSize = 50,
  overscan = 3,
  width,
  height,
  onScroll,
  scrollToIndex,
  autoScrollToBottom = false,
}: VirtualListProps<T>): ReactNode {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<VirtualListState>({
    scrollTop: 0,
    containerHeight: height ?? 400,
    items: items as VirtualListItem<unknown>[],
  })

  const totalSize = useMemo(() => {
    return items.reduce((sum, item) => sum + item.size, 0)
  }, [items])

  const getItemRange = useCallback(
    (scrollTop: number, containerHeight: number) => {
      let startIndex = 0
      let accumulated = 0

      for (let i = 0; i < items.length; i++) {
        const itemSize = items[i]!.size
        if (accumulated + itemSize >= scrollTop) {
          startIndex = i
          break
        }
        accumulated += itemSize
        startIndex = i
      }

      let endIndex = startIndex
      accumulated = items.slice(0, startIndex).reduce((sum, item) => sum + item.size, 0)

      for (let i = startIndex; i < items.length; i++) {
        accumulated += items[i]!.size
        endIndex = i
        if (accumulated >= scrollTop + containerHeight) {
          break
        }
      }

      const start = Math.max(0, startIndex - overscan)
      const end = Math.min(items.length - 1, endIndex + overscan)

      return { start, end }
    },
    [items, overscan],
  )

  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const { start, end } = getItemRange(state.scrollTop, state.containerHeight)
    let offset = 0
    for (let i = 0; i < start; i++) {
      offset += items[i]!.size
    }
    return { startIndex: start, endIndex: end, offsetY: offset }
  }, [state.scrollTop, state.containerHeight, getItemRange, items])

  const visibleItems = useMemo(() => {
    const result: { item: VirtualListItem<T>; index: number; offset: number }[] = []
    let offset = 0
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      if (i >= startIndex && i <= endIndex) {
        result.push({ item, index: i, offset })
      }
      offset += item.size
    }
    return result
  }, [items, startIndex, endIndex])

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget
      const newScrollTop = target.scrollTop
      const scrollHeight = target.scrollHeight
      const clientHeight = target.clientHeight

      setState(prev => ({ ...prev, scrollTop: newScrollTop }))
      onScroll?.(newScrollTop, scrollHeight, clientHeight)
    },
    [onScroll],
  )

  useEffect(() => {
    if (scrollToIndex !== undefined && scrollToIndex >= 0 && scrollToIndex < items.length) {
      let offset = 0
      for (let i = 0; i < scrollToIndex; i++) {
        offset += items[i]!.size
      }
      containerRef.current?.scrollTo(0, offset)
    }
  }, [scrollToIndex, items])

  useEffect(() => {
    if (autoScrollToBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [autoScrollToBottom, items])

  useEffect(() => {
    if (height !== undefined) {
      setState(prev => ({ ...prev, containerHeight: height }))
    }
  }, [height])

  return (
    <Box
      ref={containerRef as React.RefObject<HTMLDivElement>}
      flexDirection="column"
      overflowY="auto"
      width={width}
      height={height}
      onScroll={handleScroll}
    >
      <Box position="relative" height={totalSize}>
        <Box position="absolute" top={offsetY} left="0" right="0" flexDirection="column">
          {visibleItems.map(({ item, index, offset }) => (
            <Box key={item.key} height={item.size} position="relative">
              <Box position="absolute" top="0" left="0" right="0">
                {renderItem(item.data as T, index)}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

export interface ListItem<T> {
  key: string
  data: T
}

export interface SelectableListProps<T> {
  items: ListItem<T>[]
  selectedIndex: number
  onSelect: (index: number) => void
  renderItem: (item: T, index: number, isSelected: boolean) => ReactNode
  height?: number
}

export function SelectableList<T>({
  items,
  selectedIndex,
  onSelect,
  renderItem,
  height,
}: SelectableListProps<T>): ReactNode {
  const handleKeyDown = useCallback(
    (key: string) => {
      if (key === 'ArrowUp') {
        onSelect(Math.max(0, selectedIndex - 1))
      } else if (key === 'ArrowDown') {
        onSelect(Math.min(items.length - 1, selectedIndex + 1))
      } else if (key === 'Enter') {
        onSelect(selectedIndex)
      }
    },
    [items.length, onSelect, selectedIndex],
  )

  return (
    <VirtualList
      items={items as VirtualListItem<T>[]}
      renderItem={(item, index) => renderItem(item as T, index, index === selectedIndex)}
      estimatedItemSize={1}
      height={height}
    />
  )
}
