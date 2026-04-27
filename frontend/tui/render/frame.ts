export interface FrameCell {
  char: string
  fg?: string
  bg?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  dim?: boolean
  inverse?: boolean
}

export interface FrameSize {
  rows: number
  columns: number
}

export class Frame {
  private cells: FrameCell[][]
  private size: FrameSize

  constructor(size: FrameSize) {
    this.size = size
    this.cells = Array.from({ length: size.rows }, () =>
      Array.from({ length: size.columns }, () => ({ char: " " }))
    )
  }

  getSize(): FrameSize {
    return { ...this.size }
  }

  setCell(row: number, col: number, cell: Partial<FrameCell>): void {
    if (row < 0 || row >= this.size.rows || col < 0 || col >= this.size.columns) {
      return
    }

    this.cells[row][col] = {
      ...this.cells[row][col],
      ...cell,
    }
  }

  writeText(row: number, col: number, text: string, styles?: Partial<FrameCell>): void {
    let currentCol = col
    for (const char of text) {
      if (currentCol >= this.size.columns) break
      this.setCell(row, currentCol, { char, ...styles })
      currentCol++
    }
  }

  fillRow(row: number, styles?: Partial<FrameCell>): void {
    for (let col = 0; col < this.size.columns; col++) {
      this.setCell(row, col, styles ?? {})
    }
  }

  fillColumn(col: number, styles?: Partial<FrameCell>): void {
    for (let row = 0; row < this.size.rows; row++) {
      this.setCell(row, col, styles ?? {})
    }
  }

  fillRect(
    startRow: number,
    startCol: number,
    height: number,
    width: number,
    styles?: Partial<FrameCell>
  ): void {
    for (let row = startRow; row < startRow + height && row < this.size.rows; row++) {
      for (let col = startCol; col < startCol + width && col < this.size.columns; col++) {
        this.setCell(row, col, styles ?? {})
      }
    }
  }

  getCell(row: number, col: number): FrameCell | undefined {
    if (row < 0 || row >= this.size.rows || col < 0 || col >= this.size.columns) {
      return undefined
    }
    return this.cells[row][col]
  }

  getRow(row: number): FrameCell[] {
    if (row < 0 || row >= this.size.rows) return []
    return [...this.cells[row]]
  }

  getCells(): FrameCell[][] {
    return this.cells.map((row) => [...row])
  }

  clear(): void {
    this.cells = Array.from({ length: this.size.rows }, () =>
      Array.from({ length: this.size.columns }, () => ({ char: " " }))
    )
  }

  clone(): Frame {
    const newFrame = new Frame(this.size)
    newFrame.cells = this.getCells()
    return newFrame
  }

  diff(other: Frame): Array<{ row: number; col: number; old: FrameCell; new: FrameCell }> {
    const changes: Array<{ row: number; col: number; old: FrameCell; new: FrameCell }> = []

    for (let row = 0; row < this.size.rows; row++) {
      for (let col = 0; col < this.size.columns; col++) {
        const oldCell = this.cells[row][col]
        const newCell = other.cells[row][col]

        if (JSON.stringify(oldCell) !== JSON.stringify(newCell)) {
          changes.push({ row, col, old: oldCell, new: newCell })
        }
      }
    }

    return changes
  }
}
