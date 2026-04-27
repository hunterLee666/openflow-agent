import type { FrameCell } from "./frame"

export function cellToAnsi(cell: FrameCell): string {
  const codes: string[] = []

  if (cell.fg) codes.push(`38;2;${hexToRgb(cell.fg)}`)
  if (cell.bg) codes.push(`48;2;${hexToRgb(cell.bg)}`)
  if (cell.bold) codes.push("1")
  if (cell.italic) codes.push("3")
  if (cell.underline) codes.push("4")
  if (cell.dim) codes.push("2")
  if (cell.inverse) codes.push("7")

  if (codes.length === 0) {
    return cell.char
  }

  return `\x1b[${codes.join(";")}m${cell.char}\x1b[0m`
}

export function frameToAnsi(frame: FrameCell[][]): string {
  return frame.map((row) => row.map(cellToAnsi).join("")).join("\r\n")
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return "255;255;255"
  return `${parseInt(result[1], 16)};${parseInt(result[2], 16)};${parseInt(result[3], 16)}`
}

export function optimizeOutput(cells: FrameCell[]): string {
  let output = ""
  let currentFg: string | undefined
  let currentBg: string | undefined
  let currentBold = false
  let currentItalic = false
  let currentUnderline = false

  const reset = () => {
    output += "\x1b[0m"
    currentFg = undefined
    currentBg = undefined
    currentBold = false
    currentItalic = false
    currentUnderline = false
  }

  for (const cell of cells) {
    const needsFg = cell.fg !== currentFg
    const needsBg = cell.bg !== currentBg
    const needsBold = cell.bold !== currentBold
    const needsItalic = cell.italic !== currentItalic
    const needsUnderline = cell.underline !== currentUnderline

    if (needsFg || needsBg || needsBold || needsItalic || needsUnderline) {
      if (!needsFg && !needsBg && !needsBold && !needsItalic && !needsUnderline) {
        reset()
      } else {
        const codes: string[] = []
        if (cell.fg) codes.push(`38;2;${hexToRgb(cell.fg)}`)
        if (cell.bg) codes.push(`48;2;${hexToRgb(cell.bg)}`)
        if (cell.bold) codes.push("1")
        if (cell.italic) codes.push("3")
        if (cell.underline) codes.push("4")

        output += `\x1b[${codes.join(";")}m`
        currentFg = cell.fg
        currentBg = cell.bg
        currentBold = cell.bold ?? false
        currentItalic = cell.italic ?? false
        currentUnderline = cell.underline ?? false
      }
    }

    output += cell.char
  }

  reset()
  return output
}
