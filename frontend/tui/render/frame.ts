import type { Size } from '../layout/geometry.js'
import type { CharPool, HyperlinkPool, Screen, StylePool } from './screen.js'
import { z } from 'zod'

export interface Cursor {
  x: number
  y: number
  visible: boolean
}

export interface Frame {
  screen: Screen
  viewport: Size
  cursor: Cursor
}

export const CursorSchema = z.object({
  x: z.number(),
  y: z.number(),
  visible: z.boolean(),
})

export const FrameSchema = z.object({
  screen: z.any(),
  viewport: z.any(),
  cursor: CursorSchema,
})

export function createFrame(
  rows: number,
  columns: number,
  stylePool: StylePool,
  _charPool: CharPool,
  _hyperlinkPool: HyperlinkPool,
): Frame {
  return {
    screen: {
      width: columns,
      height: rows,
      cells: [],
      cursor: { x: 0, y: 0, visible: true },
      dirty: true,
    },
    viewport: { width: columns, height: rows },
    cursor: { x: 0, y: 0, visible: true },
  }
}

export type Patch =
  | { type: 'stdout'; content: string }
  | { type: 'clear'; count: number }
  | { type: 'cursorHide' }
  | { type: 'cursorShow' }
  | { type: 'cursorMove'; x: number; y: number }
  | { type: 'cursorTo'; col: number }

export type Diff = Patch[]

export interface FrameEvent {
  durationMs: number
  flickers: Array<{
    desiredHeight: number
    availableHeight: number
    reason: string
  }>
}

export function diffFrames(prev: Screen, next: Screen): Diff {
  const patches: Diff = []

  if (prev.width !== next.width || prev.height !== next.height) {
    patches.push({ type: 'clear', count: next.width * next.height })
    return patches
  }

  for (let y = 0; y < next.height; y++) {
    for (let x = 0; x < next.width; x++) {
      const prevCell = prev.cells[y]?.[x]
      const nextCell = next.cells[y]?.[x]

      if (!prevCell || !nextCell) continue

      if (
        prevCell.char !== nextCell.char ||
        prevCell.style !== nextCell.style ||
        prevCell.hyperlink !== nextCell.hyperlink
      ) {
        const content = nextCell.char
        if (content !== ' ' || prevCell.char !== ' ') {
          patches.push({ type: 'stdout', content })
        }
      }
    }
  }

  return patches
}
