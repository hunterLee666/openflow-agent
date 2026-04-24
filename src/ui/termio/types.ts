export type Grapheme = {
  value: string
  width: 1 | 2
}

export type TextStyle = {
  bold: boolean
  dim: boolean
  italic: boolean
  underline: 'none' | 'single' | 'double' | 'curly' | 'dotted' | 'dashed'
  blink: boolean
  inverse: boolean
  hidden: boolean
  strikethrough: boolean
  overline: boolean
  fg: Color
  bg: Color
  underlineColor: Color
}

export type Color =
  | { type: 'named'; name: NamedColor }
  | { type: 'indexed'; index: number }
  | { type: 'rgb'; r: number; g: number; b: number }
  | { type: 'default' }

export type NamedColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'brightBlack'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite'

export type Action =
  | { type: 'sgr'; params: string }
  | { type: 'cursor'; action: CursorAction }
  | { type: 'erase'; area: 'display' | 'line'; mode: number }
  | { type: 'scroll'; direction: 'up' | 'down'; count: number }
  | { type: 'mode'; mode: 'set' | 'unset'; code: number; value?: number | { top: number; bottom: number } }
  | { type: 'title'; title: string }
  | { type: 'hyperlink'; uri: string; id?: string }
  | { type: 'clipboard'; operation: 'set' | 'get'; content?: string; id?: string }
  | { type: 'progress'; state: 'indeterminate' | 'progress' | 'error' | 'none'; value?: number }
  | { type: 'tab_status'; status: 'notes' | 'info' | 'warning' | 'error'; index?: number }
  | { type: 'bel' }
  | { type: 'osc_string'; payload: string }
  | { type: 'ignore' }

export type CursorAction =
  | { type: 'move'; direction: 'up' | 'down' | 'forward' | 'back'; count: number }
  | { type: 'nextLine'; count: number }
  | { type: 'prevLine'; count: number }
  | { type: 'column'; col: number }
  | { type: 'position'; row: number; col: number }
  | { type: 'show' }
  | { type: 'hide' }
  | { type: 'style'; style: 'block' | 'underline' | 'bar' }

export type Cell = {
  char: string
  width: number
  style: TextStyle
  hyperlink?: { uri: string; id?: string }
}

export function defaultCell(): Cell {
  return {
    char: ' ',
    width: 1,
    style: {
      bold: false,
      dim: false,
      italic: false,
      underline: 'none',
      blink: false,
      inverse: false,
      hidden: false,
      strikethrough: false,
      overline: false,
      fg: { type: 'default' },
      bg: { type: 'default' },
      underlineColor: { type: 'default' },
    },
  }
}

export function cloneCell(cell: Cell): Cell {
  return {
    char: cell.char,
    width: cell.width,
    style: { ...cell.style },
    hyperlink: cell.hyperlink ? { ...cell.hyperlink } : undefined,
  }
}
