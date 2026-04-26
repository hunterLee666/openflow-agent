import { TextProps, Color, Modifier, Char, Bounds } from '../types'
import { TextElement, TextInstance } from './reconciler'
import { ReactElement } from 'react'

export type { Color, Modifier, Char, Bounds }

const ESC = '\x1B'

class Screen {
  buffer: Char[][]
  cursor = { x: 0, y: 0 }
  size = { x1: 0, y1: 0, x2: 0, y2: 0 }

  constructor() {
    this.buffer = this.generateBuffer()
  }

  generateBuffer() {
    this.size = { x1: 0, y1: 0, x2: process.stdout.columns, y2: process.stdout.rows }
    return [...Array(this.size.y2)].map(() => [...Array(this.size.x2)].map(() => [' ', {}] as Char))
  }

  clearBuffer() {
    this.buffer = this.generateBuffer()
    this.cursor = { x: 0, y: 0 }
  }

  render(elements: TextElement[]) {
    this.clearBuffer()
    this.renderElement(elements, { ...this.cursor, ...this.size })
  }

  stringAt(value: string, limit: number) {
    const percent = parseFloat(value)
    let diff = ''

    const index = value.search(/%[+-]\d+$/)
    if (index !== -1) diff = value.substring(index + 1)
    if (!value.endsWith('%' + diff) || isNaN(percent)) throw new Error('must be percent')

    return Math.round((limit / 100) * percent) + parseInt(diff || '0')
  }

  renderElement(element: ReactElement | ReactElement[] | any, prevBounds: Bounds, prevProps: TextProps = {}) {
    if (Array.isArray(element)) return element.forEach(i => this.renderElement(i, prevBounds, prevProps))

    if (element instanceof TextInstance) {
      const text = element.value
      if (text.includes('\n')) {
        const lines = text.split('\n')
        lines.forEach((line: string, index: number) => {
          this.cursor.x = this.put(line, prevBounds, prevProps)
          if (index < lines.length - 1) this.carret(prevBounds)
        })
      } else {
        this.cursor.x = this.put(text, prevBounds, prevProps)
      }
      return
    }

    const props = { ...(element.props ?? {}) }
    const children = props.children ?? element.children ?? (typeof element === 'string' || typeof element === 'number' ? element : null)

    if (typeof props.x === 'string')
      props.x = this.stringAt(props.x, props.absolute ? this.buffer[0].length : prevBounds.x2 - prevBounds.x)
    if (typeof props.y === 'string')
      props.y = this.stringAt(props.y, props.absolute ? this.buffer.length : prevBounds.y2 - prevBounds.y)
    if (typeof props.width === 'string')
      props.width = this.stringAt(props.width, props.absolute ? this.buffer[0].length : prevBounds.x2 - prevBounds.x)
    if (typeof props.height === 'string')
      props.height = this.stringAt(props.height, props.absolute ? this.buffer.length : prevBounds.y2 - prevBounds.y)
    if (props.width !== undefined && isNaN(props.width)) props.width = 0
    if (props.height !== undefined && isNaN(props.height)) props.height = 0
    const x = props.x !== undefined ? (props.absolute ? 0 : prevBounds.x) + props.x : this.cursor.x
    const y = props.y !== undefined ? (props.absolute ? 0 : prevBounds.y) + props.y : this.cursor.y
    const x1 =
      props.x !== undefined
        ? props.absolute
          ? props.x
          : Math.max(prevBounds.x, prevBounds.x + props.x)
        : prevBounds.x1
    const y1 =
      props.y !== undefined
        ? props.absolute
          ? props.y
          : Math.max(prevBounds.y, prevBounds.y + props.y)
        : prevBounds.y1
    const x2 =
      props.width !== undefined
        ? Math.min(props.absolute ? this.buffer[0].length : prevBounds.x2, props.width + x)
        : props.absolute
          ? this.buffer[0].length
          : prevBounds.x2
    const y2 =
      props.height !== undefined
        ? Math.min(props.absolute ? this.buffer.length : prevBounds.y2, props.height + y)
        : props.absolute
          ? this.buffer.length
          : prevBounds.y2
    const bounds = { x, y, x1, y1, x2, y2 }
    this.cursor.x = bounds.x
    this.cursor.y = bounds.y

    const modifiers = Object.fromEntries(
      ['color', 'background', 'bold', 'dim', 'italic', 'underline', 'blinking', 'inverse', 'strikethrough']
        .map(i => [i, props[i] ?? (prevProps as any)[i]])
        .filter(i => i[1])
    )
    if ((props.background || props.clear) && (props.width || props.height))
      this.fill(bounds, props.absolute ? bounds : prevBounds, modifiers)

    if (Array.isArray(children) || children?.props) {
      this.renderElement(element.children ?? children, bounds, modifiers)
    } else if (typeof children === 'number' || children) {
      const text = children.toString()
      if (text.includes('\n')) {
        const lines = children.toString().split('\n')
        lines.forEach((line: string, index: number) => {
          this.renderElement(line, bounds, modifiers)
          if (index < lines.length - 1) this.carret(prevBounds)
        })
      } else {
        this.cursor.x = this.put(text, bounds, modifiers)
      }
    }

    if (props.block) this.carret(prevBounds)
    if (props.width || props.height) {
      this.cursor.x = props.block ? prevBounds.x : bounds.x2
      this.cursor.y = props.block ? bounds.y2 : prevBounds.y
    }
  }

  fill(bounds: Bounds, prevBounds: Bounds, modifiers: TextProps) {
    for (let y = bounds.y; y < bounds.y2; y++) {
      if (y < Math.max(0, prevBounds.y1) || y >= Math.min(prevBounds.y2, this.buffer.length)) continue
      for (let x = bounds.x; x < bounds.x2; x++) {
        if (x < Math.max(0, prevBounds.x1) || x >= Math.min(prevBounds.x2, this.buffer[y].length)) continue

        this.buffer[y][x] = [' ', modifiers]
      }
    }
  }

  put(text: string, bounds: Bounds, modifiers: TextProps) {
    const { x, y } = bounds

    let i: number
    for (i = 0; i < text.length; i++) {
      if (y < Math.max(0, bounds.y1) || y >= Math.min(this.buffer.length, bounds.y2)) break
      if (x + i < Math.max(0, bounds.x1) || x + i >= Math.min(this.buffer[y].length, bounds.x2)) continue

      this.buffer[y][x + i] = [text[i], modifiers]
    }

    return x + i
  }

  carret(bounds: Bounds) {
    this.cursor.x = bounds.x ?? 0
    this.cursor.y++
  }

  parseColor(color: Color | string | number, offset = 0) {
    if (typeof color === 'number') {
      if (color < 0 || color > 255) throw new Error('color not found')
      return `${38 + offset};5;${color}`
    }

    if (typeof color === 'string' && color.startsWith('#')) {
      const hex = color.substring(1)
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      return `${38 + offset};2;${r};${g};${b}`
    }

    const names: Record<string, number> = {
      black: 30,
      red: 31,
      green: 32,
      yellow: 33,
      blue: 34,
      magenta: 35,
      cyan: 36,
      white: 37,
      brightblack: 90,
      brightred: 91,
      brightgreen: 92,
      brightyellow: 93,
      brightblue: 94,
      brightmagenta: 95,
      brightcyan: 96,
      brightwhite: 97
    }
    const colorFromName = names[String(color).toLowerCase()]
    if (colorFromName === undefined) throw new Error('color not found')
    return colorFromName + offset
  }

  createStyleCode(modifiers: Modifier): string {
    if (JSON.stringify(modifiers) === '{}') return `${ESC}[0m`

    const codes: (number | string)[] = []

    if (modifiers.color) codes.push(this.parseColor(modifiers.color))
    if (modifiers.background) codes.push(this.parseColor(modifiers.background, 10))
    if (modifiers.bold) codes.push(1)
    if (modifiers.dim) codes.push(2)
    if (modifiers.italic) codes.push(3)
    if (modifiers.underline) codes.push(4)
    if (modifiers.blinking) codes.push(5)
    if (modifiers.inverse) codes.push(7)
    if (modifiers.strikethrough) codes.push(9)

    return codes.length > 0 ? `${ESC}[${codes.join(';')}m` : `${ESC}[0m`
  }

  renderToString(): string {
    let result = ''
    let prevModifiers: Modifier = {}

    for (let y = 0; y < this.buffer.length; y++) {
      const line = this.buffer[y]
      let lineResult = ''

      for (let x = 0; x < line.length; x++) {
        const [char, modifiers] = line[x]

        if (JSON.stringify(modifiers) !== JSON.stringify(prevModifiers)) {
          lineResult += this.createStyleCode(modifiers)
          prevModifiers = modifiers
        }

        lineResult += char
      }

      result += lineResult + '\n'
    }

    return result + `${ESC}[0m`
  }
}

export default Screen
