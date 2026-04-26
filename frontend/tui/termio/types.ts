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

import { z } from 'zod'

export const GraphemeSchema = z.object({
  value: z.string(),
  width: z.union([z.literal(1), z.literal(2)]),
})

export const TextStyleSchema = z.object({
  bold: z.boolean(),
  dim: z.boolean(),
  italic: z.boolean(),
  underline: z.enum(['none', 'single', 'double', 'curly', 'dotted', 'dashed']),
  blink: z.boolean(),
  inverse: z.boolean(),
  hidden: z.boolean(),
  strikethrough: z.boolean(),
  overline: z.boolean(),
  fg: z.lazy(() => ColorSchema),
  bg: z.lazy(() => ColorSchema),
  underlineColor: z.lazy(() => ColorSchema),
})

export const NamedColorSchema = z.enum([
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
])

export const ColorSchema = z.union([
  z.object({ type: z.literal('named'), name: NamedColorSchema }),
  z.object({ type: z.literal('indexed'), index: z.number() }),
  z.object({ type: z.literal('rgb'), r: z.number(), g: z.number(), b: z.number() }),
  z.object({ type: z.literal('default') }),
])

export type Color = z.infer<typeof ColorSchema>

export const ActionSchema: z.ZodType<Action> = z.union([
  z.object({ type: z.literal('sgr'), params: z.string() }),
  z.object({ type: z.literal('cursor'), action: z.lazy(() => CursorActionSchema) }),
  z.object({ type: z.literal('erase'), area: z.enum(['display', 'line']), mode: z.number() }),
  z.object({ type: z.literal('scroll'), direction: z.enum(['up', 'down']), count: z.number() }),
  z.object({ type: z.literal('mode'), mode: z.enum(['set', 'unset']), code: z.number(), value: z.union([z.number(), z.object({ top: z.number(), bottom: z.number() })]).optional() }),
  z.object({ type: z.literal('title'), title: z.string() }),
  z.object({ type: z.literal('hyperlink'), uri: z.string(), id: z.string().optional() }),
  z.object({ type: z.literal('clipboard'), operation: z.enum(['set', 'get']), content: z.string().optional(), id: z.string().optional() }),
  z.object({ type: z.literal('progress'), state: z.enum(['indeterminate', 'progress', 'error', 'none']), value: z.number().optional() }),
  z.object({ type: z.literal('tab_status'), status: z.enum(['notes', 'info', 'warning', 'error']), index: z.number().optional() }),
  z.object({ type: z.literal('bel') }),
  z.object({ type: z.literal('osc_string'), payload: z.string() }),
  z.object({ type: z.literal('ignore') }),
])

export const CursorActionSchema: z.ZodType<CursorAction> = z.union([
  z.object({ type: z.literal('move'), direction: z.enum(['up', 'down', 'forward', 'back']), count: z.number() }),
  z.object({ type: z.literal('nextLine'), count: z.number() }),
  z.object({ type: z.literal('prevLine'), count: z.number() }),
  z.object({ type: z.literal('column'), col: z.number() }),
  z.object({ type: z.literal('position'), row: z.number(), col: z.number() }),
  z.object({ type: z.literal('show') }),
  z.object({ type: z.literal('hide') }),
  z.object({ type: z.literal('style'), style: z.enum(['block', 'underline', 'bar']) }),
])

export const CellSchema = z.object({
  char: z.string(),
  width: z.number(),
  style: TextStyleSchema,
  hyperlink: z.object({ uri: z.string(), id: z.string().optional() }).optional(),
})

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
