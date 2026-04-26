export type Color =
  | number
  | string
  | 'Black'
  | 'Red'
  | 'Green'
  | 'Yellow'
  | 'Blue'
  | 'Magenta'
  | 'Cyan'
  | 'White'
  | 'BrightBlack'
  | 'BrightRed'
  | 'BrightGreen'
  | 'BrightYellow'
  | 'BrightBlue'
  | 'BrightMagenta'
  | 'BrightCyan'
  | 'BrightWhite'

export interface Modifier {
  background?: Color
  color?: Color
  clear?: boolean
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  blinking?: boolean
  inverse?: boolean
  strikethrough?: boolean
}

export type Char = [string, Modifier]
