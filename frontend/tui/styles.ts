export interface Styles {
  position?: 'absolute' | 'relative'
  top?: number
  bottom?: number
  left?: number
  right?: number
  width?: number | string
  height?: number | string
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse'
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly'
  alignItems?: 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'baseline'
  alignContent?: 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly'
  flexGrow?: number
  flexShrink?: number
  flexBasis?: number | string
  gap?: number
  rowGap?: number
  columnGap?: number
  padding?: number
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  paddingX?: number
  paddingY?: number
  margin?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  marginX?: number
  marginY?: number
  borderStyle?: 'solid' | 'dashed' | 'double' | 'hidden'
  borderWidth?: number
  borderColor?: string
  borderTop?: boolean
  borderBottom?: boolean
  borderLeft?: boolean
  borderRight?: boolean
  borderX?: boolean
  borderY?: boolean
  borderRadius?: number
  backgroundColor?: string
  opacity?: number
  zIndex?: number
  overflow?: 'visible' | 'hidden' | 'auto'
  overflowX?: 'visible' | 'hidden' | 'auto'
  overflowY?: 'visible' | 'hidden' | 'auto'
}

export interface TextStyles {
  color?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean | 'single' | 'double' | 'curly' | 'dotted' | 'dashed'
  strikethrough?: boolean
  overline?: boolean
  inverse?: boolean
  hidden?: boolean
  blink?: boolean
}

const FLEX_PROPERTIES = [
  'flexDirection',
  'flexWrap',
  'justifyContent',
  'alignItems',
  'alignContent',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'gap',
  'rowGap',
  'columnGap',
] as const

const SPACING_PROPERTIES = [
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
] as const

export function applyStyles(styles: Styles): Record<string, string | number | undefined> {
  const result: Record<string, string | number | undefined> = {}

  if (styles.position) result.position = styles.position
  if (styles.top !== undefined) result.top = styles.top
  if (styles.bottom !== undefined) result.bottom = styles.bottom
  if (styles.left !== undefined) result.left = styles.left
  if (styles.right !== undefined) result.right = styles.right
  if (styles.width !== undefined) result.width = styles.width
  if (styles.height !== undefined) result.height = styles.height
  if (styles.flexDirection) result.flexDirection = styles.flexDirection
  if (styles.flexWrap) result.flexWrap = styles.flexWrap
  if (styles.justifyContent) result.justifyContent = styles.justifyContent
  if (styles.alignItems) result.alignItems = styles.alignItems
  if (styles.alignContent) result.alignContent = styles.alignContent
  if (styles.flexGrow !== undefined) result.flexGrow = styles.flexGrow
  if (styles.flexShrink !== undefined) result.flexShrink = styles.flexShrink
  if (styles.flexBasis !== undefined) result.flexBasis = styles.flexBasis
  if (styles.gap !== undefined) result.gap = styles.gap
  if (styles.rowGap !== undefined) result.rowGap = styles.rowGap
  if (styles.columnGap !== undefined) result.columnGap = styles.columnGap
  if (styles.padding !== undefined) result.padding = styles.padding
  if (styles.paddingTop !== undefined) result.paddingTop = styles.paddingTop
  if (styles.paddingBottom !== undefined) result.paddingBottom = styles.paddingBottom
  if (styles.paddingLeft !== undefined) result.paddingLeft = styles.paddingLeft
  if (styles.paddingRight !== undefined) result.paddingRight = styles.paddingRight
  if (styles.paddingX !== undefined) {
    result.paddingLeft = styles.paddingX
    result.paddingRight = styles.paddingX
  }
  if (styles.paddingY !== undefined) {
    result.paddingTop = styles.paddingY
    result.paddingBottom = styles.paddingY
  }
  if (styles.margin !== undefined) result.margin = styles.margin
  if (styles.marginTop !== undefined) result.marginTop = styles.marginTop
  if (styles.marginBottom !== undefined) result.marginBottom = styles.marginBottom
  if (styles.marginLeft !== undefined) result.marginLeft = styles.marginLeft
  if (styles.marginRight !== undefined) result.marginRight = styles.marginRight
  if (styles.marginX !== undefined) {
    result.marginLeft = styles.marginX
    result.marginRight = styles.marginX
  }
  if (styles.marginY !== undefined) {
    result.marginTop = styles.marginY
    result.marginBottom = styles.marginY
  }
  if (styles.borderStyle) result.borderStyle = styles.borderStyle
  if (styles.borderWidth !== undefined) result.borderWidth = styles.borderWidth
  if (styles.borderColor) result.borderColor = styles.borderColor
  if (styles.borderTop !== undefined && styles.borderTop) result.borderTopWidth = 1
  if (styles.borderBottom !== undefined && styles.borderBottom) result.borderBottomWidth = 1
  if (styles.borderLeft !== undefined && styles.borderLeft) result.borderLeftWidth = 1
  if (styles.borderRight !== undefined && styles.borderRight) result.borderRightWidth = 1
  if (styles.borderX !== undefined && styles.borderX) {
    result.borderLeftWidth = 1
    result.borderRightWidth = 1
  }
  if (styles.borderY !== undefined && styles.borderY) {
    result.borderTopWidth = 1
    result.borderBottomWidth = 1
  }
  if (styles.borderRadius !== undefined) result.borderRadius = styles.borderRadius
  if (styles.backgroundColor) result.backgroundColor = styles.backgroundColor
  if (styles.opacity !== undefined) result.opacity = styles.opacity
  if (styles.zIndex !== undefined) result.zIndex = styles.zIndex
  if (styles.overflow) result.overflow = styles.overflow
  if (styles.overflowX) result.overflowX = styles.overflowX
  if (styles.overflowY) result.overflowY = styles.overflowY

  return result
}

export function mergeStyles(...stylesList: (Styles | undefined)[]): Styles {
  const result: Styles = {}

  for (const styles of stylesList) {
    if (!styles) continue
    Object.assign(result, styles)
  }

  return result
}

export function isFlexContainer(styles: Styles): boolean {
  return (
    styles.flexDirection !== undefined ||
    styles.flexWrap !== undefined ||
    styles.justifyContent !== undefined ||
    styles.alignItems !== undefined ||
    styles.alignContent !== undefined ||
    styles.flexGrow !== undefined ||
    styles.flexShrink !== undefined ||
    styles.flexBasis !== undefined ||
    styles.gap !== undefined
  )
}

export function getStyleDiff(before: Styles, after: Styles): Styles {
  const diff: Styles = {}

  for (const key of Object.keys(after) as (keyof Styles)[]) {
    if (before[key] !== after[key]) {
      (diff as Record<string, unknown>)[key] = after[key]
    }
  }

  for (const key of Object.keys(before) as (keyof Styles)[]) {
    if (after[key] === undefined && before[key] !== undefined) {
      (diff as Record<string, unknown>)[key] = undefined
    }
  }

  return diff
}

export default { applyStyles, mergeStyles, isFlexContainer, getStyleDiff }