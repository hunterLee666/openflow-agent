export interface SGRParameters {
  reset?: boolean
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  blink?: boolean
  inverse?: boolean
  hidden?: boolean
  strikethrough?: boolean
  fgColor?: string
  bgColor?: string
  fgColorDefault?: boolean
  bgColorDefault?: boolean
}

export function parseSGR(params: string): SGRParameters {
  const result: SGRParameters = {}
  const codes = params.split(";").map((p) => parseInt(p, 10) || 0)

  let i = 0
  while (i < codes.length) {
    const code = codes[i]

    switch (code) {
      case 0:
        result.reset = true
        break
      case 1:
        result.bold = true
        break
      case 2:
        result.dim = true
        break
      case 3:
        result.italic = true
        break
      case 4:
        result.underline = true
        break
      case 5:
        result.blink = true
        break
      case 7:
        result.inverse = true
        break
      case 8:
        result.hidden = true
        break
      case 9:
        result.strikethrough = true
        break
      case 22:
        result.bold = false
        result.dim = false
        break
      case 23:
        result.italic = false
        break
      case 24:
        result.underline = false
        break
      case 25:
        result.blink = false
        break
      case 27:
        result.inverse = false
        break
      case 28:
        result.hidden = false
        break
      case 29:
        result.strikethrough = false
        break
      case 30:
      case 31:
      case 32:
      case 33:
      case 34:
      case 35:
      case 36:
      case 37:
        result.fgColor = getStandardColor(code - 30)
        break
      case 38:
        if (codes[i + 1] === 5 && i + 2 < codes.length) {
          result.fgColor = get256Color(codes[i + 2])
          i += 2
        } else if (codes[i + 1] === 2 && i + 4 < codes.length) {
          result.fgColor = `${codes[i + 2]};${codes[i + 3]};${codes[i + 4]}`
          i += 4
        }
        break
      case 39:
        result.fgColorDefault = true
        break
      case 40:
      case 41:
      case 42:
      case 43:
      case 44:
      case 45:
      case 46:
      case 47:
        result.bgColor = getStandardColor(code - 40)
        break
      case 48:
        if (codes[i + 1] === 5 && i + 2 < codes.length) {
          result.bgColor = get256Color(codes[i + 2])
          i += 2
        } else if (codes[i + 1] === 2 && i + 4 < codes.length) {
          result.bgColor = `${codes[i + 2]};${codes[i + 3]};${codes[i + 4]}`
          i += 4
        }
        break
      case 49:
        result.bgColorDefault = true
        break
      case 90:
      case 91:
      case 92:
      case 93:
      case 94:
      case 95:
      case 96:
      case 97:
        result.fgColor = getStandardColor(code - 82)
        break
      case 100:
      case 101:
      case 102:
      case 103:
      case 104:
      case 105:
      case 106:
      case 107:
        result.bgColor = getStandardColor(code - 92)
        break
    }

    i++
  }

  return result
}

const STANDARD_COLORS = [
  "#000000",
  "#800000",
  "#008000",
  "#808000",
  "#000080",
  "#800080",
  "#008080",
  "#C0C0C0",
]

function getStandardColor(index: number): string {
  return STANDARD_COLORS[index] ?? "#000000"
}

function get256Color(index: number): string {
  if (index < 8) {
    return STANDARD_COLORS[index]
  }
  if (index < 16) {
    return STANDARD_COLORS[index - 8]
  }
  if (index < 232) {
    const r = Math.floor((index - 16) / 36) * 51
    const g = Math.floor(((index - 16) % 36) / 6) * 51
    const b = ((index - 16) % 6) * 51
    return `${r};${g};${b}`
  }
  const gray = (index - 232) * 10 + 8
  return `${gray};${gray};${gray}`
}
