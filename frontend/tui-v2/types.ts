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
  | 'DimBlack'
  | 'DimRed'
  | 'DimGreen'
  | 'DimYellow'
  | 'DimBlue'
  | 'DimMagenta'
  | 'DimCyan'
  | 'DimWhite'

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

export interface TextProps extends Modifier {
  readonly absolute?: boolean
  readonly x?: number | string
  readonly y?: number | string
  readonly width?: number | string
  readonly height?: number | string
  readonly block?: boolean
  readonly children?: React.ReactNode
}

export interface Size {
  width: number
  height: number
}

export interface Bounds {
  x: number
  y: number
  x1: number
  y1: number
  x2: number
  y2: number
}

export type Char = [string, Modifier]
