const EAST_ASIAN_WIDTH_TABLE: [number, number, number][] = [
  [0x1100, 0x115F, 2],
  [0x231A, 0x231B, 2],
  [0x2329, 0x232A, 2],
  [0x23E9, 0x23EC, 2],
  [0x23F0, 0x23F0, 2],
  [0x23F3, 0x23F3, 2],
  [0x25FD, 0x25FE, 2],
  [0x2614, 0x2615, 2],
  [0x2648, 0x2653, 2],
  [0x267F, 0x267F, 2],
  [0x2693, 0x2693, 2],
  [0x26A1, 0x26A1, 2],
  [0x26AA, 0x26AB, 2],
  [0x26BD, 0x26BE, 2],
  [0x26C4, 0x26C5, 2],
  [0x26CE, 0x26CE, 2],
  [0x26D4, 0x26D4, 2],
  [0x26EA, 0x26EA, 2],
  [0x26F2, 0x26F3, 2],
  [0x26F5, 0x26F5, 2],
  [0x26FA, 0x26FA, 2],
  [0x26FD, 0x26FD, 2],
  [0x2705, 0x2705, 2],
  [0x270A, 0x270B, 2],
  [0x2728, 0x2728, 2],
  [0x274C, 0x274C, 2],
  [0x274E, 0x274E, 2],
  [0x2753, 0x2755, 2],
  [0x2757, 0x2757, 2],
  [0x2795, 0x2797, 2],
  [0x27B0, 0x27B0, 2],
  [0x27BF, 0x27BF, 2],
  [0x2B1B, 0x2B1C, 2],
  [0x2B50, 0x2B50, 2],
  [0x2B55, 0x2B55, 2],
  [0x2E80, 0x2E99, 2],
  [0x2E9B, 0x2EF3, 2],
  [0x2F00, 0x2FD5, 2],
  [0x2FF0, 0x2FFB, 2],
  [0x3000, 0x303E, 2],
  [0x3041, 0x3096, 2],
  [0x3099, 0x30FF, 2],
  [0x3105, 0x312F, 2],
  [0x3131, 0x318E, 2],
  [0x3190, 0x31E3, 2],
  [0x31EF, 0x321E, 2],
  [0x3220, 0x3247, 2],
  [0x3250, 0x4DBF, 2],
  [0x4E00, 0xA48C, 2],
  [0xA490, 0xA4C6, 2],
  [0xA960, 0xA97C, 2],
  [0xAC00, 0xD7A3, 2],
  [0xF900, 0xFAFF, 2],
  [0xFE10, 0xFE19, 2],
  [0xFE30, 0xFE52, 2],
  [0xFE54, 0xFE66, 2],
  [0xFE68, 0xFE6B, 2],
  [0xFF01, 0xFF60, 2],
  [0xFFE0, 0xFFE6, 2],
  [0x16FE0, 0x16FE4, 2],
  [0x16FF0, 0x16FF1, 2],
  [0x17000, 0x187F7, 2],
  [0x18800, 0x18CD5, 2],
  [0x18D00, 0x18D08, 2],
  [0x1AFF0, 0x1AFF3, 2],
  [0x1AFF5, 0x1AFFB, 2],
  [0x1AFFD, 0x1AFFE, 2],
  [0x1B000, 0x1B122, 2],
  [0x1B132, 0x1B132, 2],
  [0x1B150, 0x1B152, 2],
  [0x1B155, 0x1B155, 2],
  [0x1B164, 0x1B167, 2],
  [0x1B170, 0x1B2FB, 2],
  [0x1F004, 0x1F004, 2],
  [0x1F0CF, 0x1F0CF, 2],
  [0x1F18E, 0x1F18E, 2],
  [0x1F191, 0x1F19A, 2],
  [0x1F200, 0x1F202, 2],
  [0x1F210, 0x1F23B, 2],
  [0x1F240, 0x1F248, 2],
  [0x1F250, 0x1F251, 2],
  [0x1F260, 0x1F265, 2],
  [0x1F300, 0x1F320, 2],
  [0x1F32D, 0x1F335, 2],
  [0x1F337, 0x1F37C, 2],
  [0x1F37E, 0x1F393, 2],
  [0x1F3A0, 0x1F3CA, 2],
  [0x1F3CF, 0x1F3D3, 2],
  [0x1F3E0, 0x1F3F0, 2],
  [0x1F3F4, 0x1F3F4, 2],
  [0x1F3F8, 0x1F43E, 2],
  [0x1F440, 0x1F440, 2],
  [0x1F442, 0x1F4FC, 2],
  [0x1F4FF, 0x1F53D, 2],
  [0x1F54B, 0x1F54E, 2],
  [0x1F550, 0x1F567, 2],
  [0x1F57A, 0x1F57A, 2],
  [0x1F595, 0x1F596, 2],
  [0x1F5A4, 0x1F5A4, 2],
  [0x1F5FB, 0x1F64F, 2],
  [0x1F680, 0x1F6C5, 2],
  [0x1F6CC, 0x1F6CC, 2],
  [0x1F6D0, 0x1F6D2, 2],
  [0x1F6D5, 0x1F6D7, 2],
  [0x1F6DC, 0x1F6DF, 2],
  [0x1F6EB, 0x1F6EC, 2],
  [0x1F6F4, 0x1F6FC, 2],
  [0x1F7E0, 0x1F7EB, 2],
  [0x1F7F0, 0x1F7F0, 2],
  [0x1F90C, 0x1F93A, 2],
  [0x1F93C, 0x1F945, 2],
  [0x1F947, 0x1F9FF, 2],
  [0x1FA70, 0x1FA7C, 2],
  [0x1FA80, 0x1FA88, 2],
  [0x1FA90, 0x1FABD, 2],
  [0x1FABF, 0x1FAC5, 2],
  [0x1FACE, 0x1FADB, 2],
  [0x1FAE0, 0x1FAE8, 2],
  [0x1FAF0, 0x1FAF8, 2],
  [0x1FB00, 0x1FDFF, 2],
  [0x1FE00, 0x1FEFF, 2],
  [0x20000, 0x2FFFD, 2],
  [0x30000, 0x3FFFD, 2],
]

const COMBINING_MARKS_START = 0x0300
const COMBINING_MARKS_END = 0x036F
const COMBINING_DIACRITICAL_START = 0x1AB0
const COMBINING_DIACRITICAL_END = 0x1AFF
const COMBINING_DIACRITICAL_SUPPLEMENT_START = 0x20D0
const COMBINING_DIACRITICAL_SUPPLEMENT_END = 0x20FF
const COMBINING_ENCLOSING_KEYCAPS_START = 0x20DD
const COMBINING_ENCLOSING_KEYCAPS_END = 0x20E0
const COMBINING_HALF_MARKS_START = 0xFE20
const COMBINING_HALF_MARKS_END = 0xFE2F

const ZERO_WIDTH_JOINER = 0x200D
const VARIATION_SELECTOR_START = 0xFE00
const VARIATION_SELECTOR_END = 0xFE0F
const VARIATION_SELECTOR_SUPPLEMENT_START = 0xE0100
const VARIATION_SELECTOR_SUPPLEMENT_END = 0xE01EF

const SKIN_TONE_MODIFIER_START = 0x1F3FB
const SKIN_TONE_MODIFIER_END = 0x1F3FF

function binarySearch(codePoint: number): number {
  let low = 0
  let high = EAST_ASIAN_WIDTH_TABLE.length - 1

  while (low <= high) {
    const mid = (low + high) >>> 1
    const [start, end, width] = EAST_ASIAN_WIDTH_TABLE[mid]

    if (codePoint >= start && codePoint <= end) {
      return width
    } else if (codePoint < start) {
      high = mid - 1
    } else {
      low = mid + 1
    }
  }

  return 1
}

function isCombiningMark(codePoint: number): boolean {
  return (
    (codePoint >= COMBINING_MARKS_START && codePoint <= COMBINING_MARKS_END) ||
    (codePoint >= COMBINING_DIACRITICAL_START && codePoint <= COMBINING_DIACRITICAL_END) ||
    (codePoint >= COMBINING_DIACRITICAL_SUPPLEMENT_START && codePoint <= COMBINING_DIACRITICAL_SUPPLEMENT_END) ||
    (codePoint >= COMBINING_ENCLOSING_KEYCAPS_START && codePoint <= COMBINING_ENCLOSING_KEYCAPS_END) ||
    (codePoint >= COMBINING_HALF_MARKS_START && codePoint <= COMBINING_HALF_MARKS_END)
  )
}

function isVariationSelector(codePoint: number): boolean {
  return (
    (codePoint >= VARIATION_SELECTOR_START && codePoint <= VARIATION_SELECTOR_END) ||
    (codePoint >= VARIATION_SELECTOR_SUPPLEMENT_START && codePoint <= VARIATION_SELECTOR_SUPPLEMENT_END)
  )
}

function isSkinToneModifier(codePoint: number): boolean {
  return codePoint >= SKIN_TONE_MODIFIER_START && codePoint <= SKIN_TONE_MODIFIER_END
}

function isZeroWidthJoiner(codePoint: number): boolean {
  return codePoint === ZERO_WIDTH_JOINER
}

function getCodePoints(str: string): number[] {
  return Array.from(str).map((c) => c.codePointAt(0)!)
}

export function getStringWidth(str: string): number {
  if (!str) return 0

  const codePoints = getCodePoints(str)
  let width = 0
  let i = 0

  while (i < codePoints.length) {
    const cp = codePoints[i]

    if (isCombiningMark(cp) || isVariationSelector(cp) || isZeroWidthJoiner(cp)) {
      i++
      continue
    }

    if (isSkinToneModifier(cp)) {
      i++
      continue
    }

    const charWidth = binarySearch(cp)
    width += charWidth

    i++

    while (i < codePoints.length) {
      const nextCp = codePoints[i]

      if (isCombiningMark(nextCp) || isVariationSelector(nextCp) || isZeroWidthJoiner(nextCp)) {
        i++
        continue
      }

      if (isSkinToneModifier(nextCp)) {
        i++
        continue
      }

      break
    }
  }

  return width
}

export function getCharWidth(char: string): number {
  if (!char || char.length === 0) return 0

  const codePoints = getCodePoints(char)
  if (codePoints.length === 0) return 0

  const cp = codePoints[0]

  if (isCombiningMark(cp) || isVariationSelector(cp) || isZeroWidthJoiner(cp)) {
    return 0
  }

  if (isSkinToneModifier(cp)) {
    return 0
  }

  return binarySearch(cp)
}

export function truncateString(str: string, maxWidth: number): string {
  if (!str) return ''

  let width = 0
  let result = ''
  const codePoints = getCodePoints(str)
  let i = 0

  while (i < codePoints.length) {
    const cp = codePoints[i]

    if (isCombiningMark(cp) || isVariationSelector(cp) || isZeroWidthJoiner(cp)) {
      result += String.fromCodePoint(cp)
      i++
      continue
    }

    if (isSkinToneModifier(cp)) {
      result += String.fromCodePoint(cp)
      i++
      continue
    }

    const charWidth = binarySearch(cp)

    if (width + charWidth > maxWidth) {
      break
    }

    result += String.fromCodePoint(cp)
    width += charWidth
    i++

    while (i < codePoints.length) {
      const nextCp = codePoints[i]

      if (isCombiningMark(nextCp) || isVariationSelector(nextCp) || isZeroWidthJoiner(nextCp)) {
        result += String.fromCodePoint(nextCp)
        i++
        continue
      }

      if (isSkinToneModifier(nextCp)) {
        result += String.fromCodePoint(nextCp)
        i++
        continue
      }

      break
    }
  }

  return result
}

export function padString(str: string, targetWidth: number, padChar: string = ' '): string {
  const currentWidth = getStringWidth(str)

  if (currentWidth >= targetWidth) {
    return truncateString(str, targetWidth)
  }

  const paddingNeeded = targetWidth - currentWidth
  const padWidth = getStringWidth(padChar)

  if (padWidth === 0) {
    return str
  }

  const padCount = Math.floor(paddingNeeded / padWidth)
  return str + padChar.repeat(padCount)
}

export function measureTextLines(
  lines: string[],
  maxWidth: number
): Array<{ text: string; width: number; lineCount: number }> {
  return lines.map((line) => {
    const width = getStringWidth(line)
    const lineCount = Math.ceil(width / maxWidth)
    return { text: line, width, lineCount }
  })
}

export function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return ['']

  const lines: string[] = []
  let currentLine = ''
  let currentWidth = 0

  const codePoints = getCodePoints(text)
  let i = 0

  while (i < codePoints.length) {
    const cp = codePoints[i]
    const charWidth = getCharWidth(String.fromCodePoint(cp))

    if (currentWidth + charWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = ''
      currentWidth = 0
    }

    currentLine += String.fromCodePoint(cp)
    currentWidth += charWidth
    i++

    while (i < codePoints.length) {
      const nextCp = codePoints[i]

      if (isCombiningMark(nextCp) || isVariationSelector(nextCp) || isZeroWidthJoiner(nextCp)) {
        currentLine += String.fromCodePoint(nextCp)
        i++
        continue
      }

      if (isSkinToneModifier(nextCp)) {
        currentLine += String.fromCodePoint(nextCp)
        i++
        continue
      }

      break
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines
}

export function normalizeStringForDisplay(str: string): string {
  return str.normalize('NFC')
}

export function getDisplayWidth(str: string): number {
  return getStringWidth(normalizeStringForDisplay(str))
}

export const UNICODE_VERSION = '15.1.0'

export const UNICODE_TABLE_VERSION = '2024-01-15'
