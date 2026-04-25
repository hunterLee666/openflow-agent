import {
  LayoutAlign,
  LayoutDisplay,
  type LayoutEdge,
  type LayoutFlexDirection,
  type LayoutGutter,
  type LayoutJustify,
  type LayoutMeasureFunc,
  LayoutMeasureMode,
  type LayoutNode,
  type LayoutOverflow,
  type LayoutPositionType,
  type LayoutWrap,
} from './node.js'

const EDGE_MAP: Record<LayoutEdge, number> = {
  all: 0,
  horizontal: 1,
  vertical: 2,
  left: 3,
  right: 4,
  top: 5,
  bottom: 6,
  start: 7,
  end: 8,
}

const GUTTER_MAP: Record<LayoutGutter, number> = {
  all: 0,
  column: 1,
  row: 2,
}

interface FlexStyle {
  display: LayoutDisplay
  width: number | null
  height: number | null
  widthPercent: number | null
  heightPercent: number | null
  minWidth: number | null
  minHeight: number | null
  maxWidth: number | null
  maxHeight: number | null
  flexDirection: LayoutFlexDirection
  flexGrow: number
  flexShrink: number
  flexBasis: number | null
  flexBasisPercent: number | null
  flexWrap: LayoutWrap
  alignItems: LayoutAlign
  alignSelf: LayoutAlign
  justifyContent: LayoutJustify
  positionType: LayoutPositionType
  position: Record<string, number>
  positionPercent: Record<string, number>
  overflow: LayoutOverflow
  margin: Record<string, number>
  padding: Record<string, number>
  border: Record<string, number>
  gap: Record<string, number>
}

interface ComputedLayout {
  left: number
  top: number
  width: number
  height: number
  border: Record<string, number>
  padding: Record<string, number>
}

export class FlexLayoutNode implements LayoutNode {
  private children: FlexLayoutNode[] = []
  private parentNode: FlexLayoutNode | null = null
  private measureFunc: LayoutMeasureFunc | null = null

  private computedLayout: ComputedLayout = {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    border: { left: 0, right: 0, top: 0, bottom: 0 },
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
  }

  private flexStyle: FlexStyle = {
    display: 'flex',
    width: null,
    height: null,
    widthPercent: null,
    heightPercent: null,
    minWidth: null,
    minHeight: null,
    maxWidth: null,
    maxHeight: null,
    flexDirection: 'row',
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: null,
    flexBasisPercent: null,
    flexWrap: 'nowrap',
    alignItems: 'stretch',
    alignSelf: 'auto',
    justifyContent: 'flex-start',
    positionType: 'relative',
    position: { all: 0, horizontal: 0, vertical: 0, left: 0, right: 0, top: 0, bottom: 0, start: 0, end: 0 },
    positionPercent: { all: 0, horizontal: 0, vertical: 0, left: 0, right: 0, top: 0, bottom: 0, start: 0, end: 0 },
    overflow: 'visible',
    margin: { all: 0, horizontal: 0, vertical: 0, left: 0, right: 0, top: 0, bottom: 0, start: 0, end: 0 },
    padding: { all: 0, horizontal: 0, vertical: 0, left: 0, right: 0, top: 0, bottom: 0, start: 0, end: 0 },
    border: { all: 0, horizontal: 0, vertical: 0, left: 0, right: 0, top: 0, bottom: 0, start: 0, end: 0 },
    gap: { all: 0, column: 0, row: 0 },
  }

  private dirtyFlag = true

  insertChild(child: LayoutNode, index: number): void {
    const flexChild = child as FlexLayoutNode
    flexChild.parentNode = this
    this.children.splice(index, 0, flexChild)
    this.dirtyFlag = true
  }

  removeChild(child: LayoutNode): void {
    const flexChild = child as FlexLayoutNode
    const index = this.children.indexOf(flexChild)
    if (index !== -1) {
      this.children.splice(index, 1)
      flexChild.parentNode = null
    }
    this.dirtyFlag = true
  }

  getChildCount(): number {
    return this.children.length
  }

  getParent(): LayoutNode | null {
    return this.parentNode
  }

  calculateLayout(width?: number, _height?: number): void {
    const availableWidth = width ?? 0
    const availableHeight = _height ?? 0

    this.calculateNodeLayout(availableWidth, availableHeight)
  }

  private calculateNodeLayout(availableWidth: number, availableHeight: number): void {
    if (this.flexStyle.display === 'none') {
      this.computedLayout.width = 0
      this.computedLayout.height = 0
      return
    }

    const isRow = this.flexStyle.flexDirection === 'row' || this.flexStyle.flexDirection === 'row-reverse'
    const isColumn = this.flexStyle.flexDirection === 'column' || this.flexStyle.flexDirection === 'column-reverse'

    let mainSize = 0
    let crossSize = 0

    if (this.children.length === 0) {
      if (this.measureFunc) {
        const mode = availableWidth === Infinity ? LayoutMeasureMode.AtMost : LayoutMeasureMode.Exactly
        const result = this.measureFunc(availableWidth, mode)
        mainSize = isRow ? result.width : result.height
        crossSize = isRow ? result.height : result.width
      } else {
        mainSize = this.flexStyle.width ?? this.flexStyle.widthPercent ? availableWidth : 0
        crossSize = this.flexStyle.height ?? this.flexStyle.heightPercent ? availableHeight : 0
      }
    } else {
      for (const child of this.children) {
        if (child.flexStyle.positionType === 'absolute') {
          child.calculateNodeLayout(availableWidth, availableHeight)
        } else {
          child.calculateNodeLayout(
            this.flexStyle.width ?? availableWidth,
            this.flexStyle.height ?? availableHeight,
          )
        }
      }

      const gapValue = this.flexStyle.gap['column'] ?? this.flexStyle.gap['row'] ?? 0
      const gaps = this.children.length > 1 ? gapValue * (this.children.length - 1) : 0

      if (isRow) {
        mainSize = this.children.reduce((sum, child) => sum + child.computedLayout.width, 0) + gaps
        crossSize = Math.max(...this.children.map(child => child.computedLayout.height))
      } else if (isColumn) {
        mainSize = this.children.reduce((sum, child) => sum + child.computedLayout.height, 0) + gaps
        crossSize = Math.max(...this.children.map(child => child.computedLayout.width))
      }
    }

    this.computedLayout.width = this.resolveSize(this.flexStyle.width, this.flexStyle.widthPercent, availableWidth, mainSize)
    this.computedLayout.height = this.resolveSize(this.flexStyle.height, this.flexStyle.heightPercent, availableHeight, crossSize)

    this.layoutChildren()
  }

  private layoutChildren(): void {
    const isRow = this.flexStyle.flexDirection === 'row' || this.flexStyle.flexDirection === 'row-reverse'
    const crossAxis = isRow ? 'height' : 'width'
    const crossAxisStart = isRow ? 'top' : 'left'

    let mainPos = 0
    const mainAxis = isRow ? 'width' : 'height'

    for (const child of this.children) {
      if (child.flexStyle.positionType === 'absolute') {
        const left = child.flexStyle.position['left'] ?? child.flexStyle.position['start'] ?? 0
        const top = child.flexStyle.position['top'] ?? child.flexStyle.position['start'] ?? 0
        child.computedLayout.left = left
        child.computedLayout.top = top
      } else {
        child.computedLayout.left = mainPos
        child.computedLayout.top = 0

        const align = child.flexStyle.alignSelf !== 'auto' ? child.flexStyle.alignSelf : this.flexStyle.alignItems

        if (align === 'center') {
          const offset = (this.computedLayout[crossAxis] - child.computedLayout[crossAxis]) / 2
          child.computedLayout[crossAxisStart] = offset
        } else if (align === 'flex-end') {
          child.computedLayout[crossAxisStart] = this.computedLayout[crossAxis] - child.computedLayout[crossAxis]
        }

        mainPos += child.computedLayout[mainAxis] + (this.flexStyle.gap['column'] ?? 0)
      }
    }
  }

  private resolveSize(
    value: number | null,
    percent: number | null,
    available: number,
    contentSize: number,
  ): number {
    if (value !== null) return value
    if (percent !== null) return (available * percent) / 100
    return contentSize
  }

  setMeasureFunc(fn: LayoutMeasureFunc): void {
    this.measureFunc = fn
  }

  unsetMeasureFunc(): void {
    this.measureFunc = null
  }

  markDirty(): void {
    this.dirtyFlag = true
  }

  getComputedLeft(): number {
    return this.computedLayout.left
  }

  getComputedTop(): number {
    return this.computedLayout.top
  }

  getComputedWidth(): number {
    return this.computedLayout.width
  }

  getComputedHeight(): number {
    return this.computedLayout.height
  }

  getComputedBorder(edge: LayoutEdge): number {
    return this.computedLayout.border[edge] ?? 0
  }

  getComputedPadding(edge: LayoutEdge): number {
    return this.computedLayout.padding[edge] ?? 0
  }

  setWidth(value: number): void {
    this.flexStyle.width = value
    this.dirtyFlag = true
  }

  setWidthPercent(value: number): void {
    this.flexStyle.widthPercent = value
    this.dirtyFlag = true
  }

  setWidthAuto(): void {
    this.flexStyle.width = null
    this.flexStyle.widthPercent = null
    this.dirtyFlag = true
  }

  setHeight(value: number): void {
    this.flexStyle.height = value
    this.dirtyFlag = true
  }

  setHeightPercent(value: number): void {
    this.flexStyle.heightPercent = value
    this.dirtyFlag = true
  }

  setHeightAuto(): void {
    this.flexStyle.height = null
    this.flexStyle.heightPercent = null
    this.dirtyFlag = true
  }

  setMinWidth(value: number): void {
    this.flexStyle.minWidth = value
    this.dirtyFlag = true
  }

  setMinWidthPercent(_value: number): void {
    this.dirtyFlag = true
  }

  setMinHeight(value: number): void {
    this.flexStyle.minHeight = value
    this.dirtyFlag = true
  }

  setMinHeightPercent(_value: number): void {
    this.dirtyFlag = true
  }

  setMaxWidth(value: number): void {
    this.flexStyle.maxWidth = value
    this.dirtyFlag = true
  }

  setMaxWidthPercent(_value: number): void {
    this.dirtyFlag = true
  }

  setMaxHeight(value: number): void {
    this.flexStyle.maxHeight = value
    this.dirtyFlag = true
  }

  setMaxHeightPercent(_value: number): void {
    this.dirtyFlag = true
  }

  setFlexDirection(dir: LayoutFlexDirection): void {
    this.flexStyle.flexDirection = dir
    this.dirtyFlag = true
  }

  setFlexGrow(value: number): void {
    this.flexStyle.flexGrow = value
    this.dirtyFlag = true
  }

  setFlexShrink(value: number): void {
    this.flexStyle.flexShrink = value
    this.dirtyFlag = true
  }

  setFlexBasis(value: number): void {
    this.flexStyle.flexBasis = value
    this.dirtyFlag = true
  }

  setFlexBasisPercent(value: number): void {
    this.flexStyle.flexBasisPercent = value
    this.dirtyFlag = true
  }

  setFlexWrap(wrap: LayoutWrap): void {
    this.flexStyle.flexWrap = wrap
    this.dirtyFlag = true
  }

  setAlignItems(align: LayoutAlign): void {
    this.flexStyle.alignItems = align
    this.dirtyFlag = true
  }

  setAlignSelf(align: LayoutAlign): void {
    this.flexStyle.alignSelf = align
    this.dirtyFlag = true
  }

  setJustifyContent(justify: LayoutJustify): void {
    this.flexStyle.justifyContent = justify
    this.dirtyFlag = true
  }

  setDisplay(display: LayoutDisplay): void {
    this.flexStyle.display = display
    this.dirtyFlag = true
  }

  getDisplay(): LayoutDisplay {
    return this.flexStyle.display
  }

  setPositionType(type: LayoutPositionType): void {
    this.flexStyle.positionType = type
    this.dirtyFlag = true
  }

  setPosition(edge: LayoutEdge, value: number): void {
    this.flexStyle.position[edge] = value
    this.dirtyFlag = true
  }

  setPositionPercent(edge: LayoutEdge, value: number): void {
    this.flexStyle.positionPercent[edge] = value
    this.dirtyFlag = true
  }

  setOverflow(overflow: LayoutOverflow): void {
    this.flexStyle.overflow = overflow
    this.dirtyFlag = true
  }

  setMargin(edge: LayoutEdge, value: number): void {
    this.flexStyle.margin[edge] = value
    this.dirtyFlag = true
  }

  setPadding(edge: LayoutEdge, value: number): void {
    this.flexStyle.padding[edge] = value
    this.dirtyFlag = true
  }

  setBorder(edge: LayoutEdge, value: number): void {
    this.flexStyle.border[edge] = value
    this.dirtyFlag = true
  }

  setGap(gutter: LayoutGutter, value: number): void {
    this.flexStyle.gap[gutter] = value
    this.dirtyFlag = true
  }

  free(): void {
    this.children = []
    this.parentNode = null
  }

  freeRecursive(): void {
    for (const child of this.children) {
      child.freeRecursive()
    }
    this.free()
  }
}

export function createFlexLayoutNode(): LayoutNode {
  return new FlexLayoutNode()
}
