import type { Rectangle, Size } from '../layout/geometry.js'
import { z } from 'zod'

export const TerminalCursorSchema = z.object({
  x: z.number(),
  y: z.number(),
  visible: z.boolean(),
})
export type TerminalCursor = z.infer<typeof TerminalCursorSchema>

export const CellSchema = z.object({
  char: z.string(),
  style: z.number(),
  hyperlink: z.number(),
})
export type Cell = z.infer<typeof CellSchema>

export const ScreenSchema = z.object({
  width: z.number(),
  height: z.number(),
  cells: z.array(z.array(CellSchema)),
  cursor: TerminalCursorSchema,
  dirty: z.boolean(),
})
export type Screen = z.infer<typeof ScreenSchema>

export class CharPool {
  private strings: string[] = [' ', '']
  private stringMap = new Map<string, number>([
    [' ', 0],
    ['', 1],
  ])
  private ascii: Int32Array

  constructor() {
    this.ascii = new Int32Array(128).fill(-1)
    this.ascii[32] = 0
    this.ascii[0] = 1
  }

  intern(char: string): number {
    if (char.length === 1) {
      const code = char.charCodeAt(0)
      if (code < 128) {
        const cached = this.ascii[code]
        if (cached !== -1) return cached
        const index = this.strings.length
        this.strings.push(char)
        this.ascii[code] = index
        return index
      }
    }
    const existing = this.stringMap.get(char)
    if (existing !== undefined) return existing
    const index = this.strings.length
    this.strings.push(char)
    this.stringMap.set(char, index)
    return index
  }

  get(index: number): string {
    return this.strings[index] ?? ' '
  }
}

export class HyperlinkPool {
  private strings: string[] = ['']
  private stringMap = new Map<string, number>()

  intern(hyperlink: string | undefined): number {
    if (!hyperlink) return 0
    const existing = this.stringMap.get(hyperlink)
    if (existing !== undefined) return existing
    const index = this.strings.length
    this.strings.push(hyperlink)
    this.stringMap.set(hyperlink, index)
    return index
  }

  get(id: number): string | undefined {
    return id === 0 ? undefined : this.strings[id]
  }
}

export class StylePool {
  private ids = new Map<string, number>()
  private styles: number[][] = []
  readonly none: number

  constructor() {
    this.none = this.intern([])
  }

  intern(styles: number[]): number {
    const key = styles.length === 0 ? '' : styles.join(',')
    let id = this.ids.get(key)
    if (id === undefined) {
      id = this.styles.length
      this.styles.push(styles.length === 0 ? [] : styles)
      this.ids.set(key, id)
    }
    return id
  }

  get(id: number): number[] {
    return this.styles[id] ?? []
  }
}

export function createScreen(
  width: number,
  height: number,
  stylePool: StylePool,
  _charPool: CharPool,
  _hyperlinkPool: HyperlinkPool,
): Screen {
  const cells: Cell[][] = []
  for (let y = 0; y < height; y++) {
    const row: Cell[] = []
    for (let x = 0; x < width; x++) {
      row.push({
        char: ' ',
        style: stylePool.none,
        hyperlink: 0,
      })
    }
    cells.push(row)
  }

  return {
    width,
    height,
    cells,
    cursor: { x: 0, y: 0, visible: true },
    dirty: true,
  }
}

export function clearScreen(screen: Screen, stylePool: StylePool): void {
  for (let y = 0; y < screen.height; y++) {
    for (let x = 0; x < screen.width; x++) {
      screen.cells[y][x] = {
        char: ' ',
        style: stylePool.none,
        hyperlink: 0,
      }
    }
  }
  screen.dirty = true
}

export function resizeScreen(
  screen: Screen,
  width: number,
  height: number,
  stylePool: StylePool,
): Screen {
  const newCells: Cell[][] = []
  for (let y = 0; y < height; y++) {
    const row: Cell[] = []
    for (let x = 0; x < width; x++) {
      if (y < screen.height && x < screen.width) {
        row.push({ ...screen.cells[y][x] })
      } else {
        row.push({
          char: ' ',
          style: stylePool.none,
          hyperlink: 0,
        })
      }
    }
    newCells.push(row)
  }

  return {
    width,
    height,
    cells: newCells,
    cursor: { ...screen.cursor },
    dirty: true,
  }
}

export function getCell(screen: Screen, x: number, y: number): Cell | null {
  if (x < 0 || x >= screen.width || y < 0 || y >= screen.height) {
    return null
  }
  return screen.cells[y][x]
}

export function setCell(
  screen: Screen,
  x: number,
  y: number,
  char: string,
  style: number,
  hyperlink: number = 0,
): void {
  if (x < 0 || x >= screen.width || y < 0 || y >= screen.height) {
    return
  }
  screen.cells[y][x] = { char, style, hyperlink }
  screen.dirty = true
}

export function getScreenRect(screen: Screen): Rectangle {
  return {
    x: 0,
    y: 0,
    width: screen.width,
    height: screen.height,
  }
}

export function cloneScreen(screen: Screen): Screen {
  return {
    width: screen.width,
    height: screen.height,
    cells: screen.cells.map(row => row.map(cell => ({ ...cell }))),
    cursor: { ...screen.cursor },
    dirty: false,
  }
}
