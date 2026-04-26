export interface TextProps {
  readonly absolute?: boolean
  readonly x?: number | string
  readonly y?: number | string
  readonly width?: number | string
  readonly height?: number | string
  readonly block?: boolean
  readonly children?: React.ReactNode
  readonly color?: string
  readonly background?: string
  readonly bold?: boolean
  readonly dim?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly blinking?: boolean
  readonly inverse?: boolean
  readonly strikethrough?: boolean
}
