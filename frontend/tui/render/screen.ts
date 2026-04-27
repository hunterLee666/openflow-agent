import { Frame, type FrameCell } from "./frame"
import { frameToAnsi } from "./output"

export class Screen {
  private currentFrame: Frame | null = null
  private rows: number
  private columns: number
  private cursorVisible = true
  private cursorRow = 0
  private cursorCol = 0

  constructor(rows: number, columns: number) {
    this.rows = rows
    this.columns = columns
  }

  setSize(rows: number, columns: number): void {
    this.rows = rows
    this.columns = columns
    this.currentFrame = null
  }

  render(frame: Frame): string {
    const output = this.diffAndRender(frame)
    this.currentFrame = frame.clone()
    return output
  }

  private diffAndRender(newFrame: Frame): string {
    if (!this.currentFrame) {
      return this.fullRender(newFrame)
    }

    const changes = this.currentFrame.diff(newFrame)

    if (changes.length === 0) {
      return ""
    }

    let output = ""

    const changedRows = new Set(changes.map((c) => c.row))
    for (const row of changedRows) {
      output += this.moveCursorToRow(row)
      output += this.renderRow(newFrame.getRow(row))
    }

    return output
  }

  private fullRender(frame: Frame): string {
    let output = this.moveCursorTo(0, 0)

    for (let row = 0; row < this.rows; row++) {
      output += frameToAnsi([frame.getRow(row)])
      if (row < this.rows - 1) {
        output += "\r\n"
      }
    }

    return output
  }

  private renderRow(row: FrameCell[]): string {
    return frameToAnsi([row])
  }

  private moveCursorTo(row: number, col: number): string {
    this.cursorRow = row
    this.cursorCol = col
    return `\x1b[${row + 1};${col + 1}H`
  }

  private moveCursorToRow(row: number): string {
    return this.moveCursorTo(row, 0)
  }

  showCursor(): string {
    this.cursorVisible = true
    return "\x1b[?25h"
  }

  hideCursor(): string {
    this.cursorVisible = false
    return "\x1b[?25l"
  }

  clear(): string {
    return "\x1b[2J\x1b[H"
  }

  clearLine(): string {
    return "\x1b[2K"
  }

  scrollUp(lines: number): string {
    return `\x1b[${lines}S`
  }

  scrollDown(lines: number): string {
    return `\x1b[${lines}T`
  }
}
