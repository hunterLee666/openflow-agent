import React, { type ReactNode, useState, useCallback, useMemo } from 'react'
import { Box } from './Box.js'
import { Text } from './Text.js'
import { z } from 'zod'

export const TagTabsPropsSchema = z.object({
  tabs: z.array(z.string()),
  selectedIndex: z.number(),
  onSelect: z.function().args(z.number()).returns(z.void()),
  availableWidth: z.number().optional(),
  showAllProjects: z.boolean().optional(),
})
export type TagTabsProps = z.infer<typeof TagTabsPropsSchema>

const TAB_PADDING = 2
const HASH_PREFIX = '#'
const ARROW_LEFT = '←'
const ARROW_RIGHT = '→'
const MAX_TAB_WIDTH = 20
const MIN_TAB_WIDTH = 8

function measureText(text: string): number {
  return text.length
}

function truncateText(text: string, maxWidth: number): string {
  if (measureText(text) <= maxWidth) return text
  return text.slice(0, maxWidth - 1) + '…'
}

export function TagTabs({
  tabs,
  selectedIndex,
  onSelect,
  availableWidth = 100,
  showAllProjects = false,
}: TagTabsProps): ReactNode {
  const resumeLabel = showAllProjects ? 'Resume (All Projects)' : 'Resume'
  const resumeWidth = measureText(resumeLabel) + 2

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const tabWidths = useMemo(() => {
    return tabs.map(tab => {
      const contentWidth = Math.min(measureText(tab), MAX_TAB_WIDTH)
      return TAB_PADDING + contentWidth + TAB_PADDING + 1
    })
  }, [tabs])

  const maxTabsWidth = availableWidth - resumeWidth - 10

  const visibleRange = useMemo(() => {
    if (tabs.length === 0) return { start: 0, end: 0 }

    let totalWidth = 0
    let end = tabs.length

    for (let i = 0; i < tabs.length; i++) {
      totalWidth += tabWidths[i]!
      if (totalWidth > maxTabsWidth) {
        end = i
        break
      }
    }

    let start = Math.max(0, selectedIndex - Math.floor((end - selectedIndex) / 2))
    const adjustedEnd = Math.min(tabs.length, start + Math.ceil(maxTabsWidth / MIN_TAB_WIDTH))

    let adjustedTotalWidth = 0
    for (let i = start; i < adjustedEnd; i++) {
      adjustedTotalWidth += tabWidths[i]!
    }

    while (adjustedTotalWidth > maxTabsWidth && start < adjustedEnd) {
      adjustedTotalWidth -= tabWidths[start]!
      start++
    }

    return { start, end: adjustedEnd }
  }, [tabs, tabWidths, selectedIndex, maxTabsWidth])

  const handleTabClick = useCallback(
    (index: number) => {
      onSelect(index)
    },
    [onSelect],
  )

  const handleKeyDown = useCallback(
    (key: string) => {
      if (key === 'ArrowLeft') {
        onSelect(Math.max(0, selectedIndex - 1))
      } else if (key === 'ArrowRight') {
        onSelect(Math.min(tabs.length - 1, selectedIndex + 1))
      }
    },
    [tabs.length, onSelect, selectedIndex],
  )

  const showLeftArrow = visibleRange.start > 0
  const showRightArrow = visibleRange.end < tabs.length

  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      {showLeftArrow && (
        <Text color="dim" onClick={() => onSelect(Math.max(0, selectedIndex - 1))}>
          {ARROW_LEFT}
        </Text>
      )}

      <Box flexDirection="row" gap={1} flexGrow={1}>
        {tabs.slice(visibleRange.start, visibleRange.end).map((tab, i) => {
          const actualIndex = visibleRange.start + i
          const isSelected = actualIndex === selectedIndex
          const isHovered = hoveredIndex === actualIndex
          const truncatedTab = truncateText(tab, MAX_TAB_WIDTH - TAB_PADDING - 1)

          return (
            <Box
              key={`${tab}-${actualIndex}`}
              padding={TAB_PADDING}
              onClick={() => handleTabClick(actualIndex)}
              onMouseEnter={() => setHoveredIndex(actualIndex)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <Text
                color={isSelected ? 'brightWhite' : isHovered ? 'white' : 'dim'}
                bold={isSelected}
              >
                {HASH_PREFIX}{truncatedTab}
              </Text>
            </Box>
          )
        })}
      </Box>

      {showRightArrow && (
        <Text color="dim" onClick={() => onSelect(Math.min(tabs.length - 1, selectedIndex + 1))}>
          {ARROW_RIGHT}
        </Text>
      )}

      <Text color="cyan" dimColor>
        {resumeLabel}
      </Text>
    </Box>
  )
}
