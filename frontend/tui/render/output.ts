import type { Patch, Diff } from './frame.js'

const ESC = '\x1b'
const CSI = '\x1b['

export function writeDiffToTerminal(diff: Diff): string {
  let output = ''

  for (const patch of diff) {
    switch (patch.type) {
      case 'stdout':
        output += patch.content
        break

      case 'clear':
        output += `${ESC}[${patch.count}J`
        break

      case 'cursorHide':
        output += `${CSI}?25l`
        break

      case 'cursorShow':
        output += `${CSI}?25h`
        break

      case 'cursorMove':
        output += `${ESC}[${patch.y + 1};${patch.x + 1}H`
        break

      case 'cursorTo':
        output += `${ESC}[${patch.col}G`
        break
    }
  }

  return output
}

export function renderScreen(
  screen: { width: number; height: number; cells: Array<Array<{ char: string; style: number; hyperlink: number }>> },
  _styleToAnsi: (style: number) => string,
): string {
  let output = ''
  output += `${ESC}[2J`
  output += `${ESC}[1;1H`

  for (let y = 0; y < screen.height; y++) {
    for (let x = 0; x < screen.width; x++) {
      const cell = screen.cells[y]?.[x]
      if (!cell) continue

      output += cell.char
    }
    if (y < screen.height - 1) {
      output += '\n'
    }
  }

  output += `${ESC}[0m`

  return output
}

export function moveCursor(x: number, y: number): string {
  return `${ESC}[${y + 1};${x + 1}H`
}

export function hideCursor(): string {
  return `${CSI}?25l`
}

export function showCursor(): string {
  return `${CSI}?25h`
}

export function clearScreen(): string {
  return `${ESC}[2J`
}

export function clearLine(): string {
  return `${ESC}[2K`
}
