import type { LayoutNode } from './node.js'
import { createFlexLayoutNode } from './yoga.js'

export function createLayoutNode(): LayoutNode {
  return createFlexLayoutNode()
}

export * from './node.js'
export { unionRect, intersectRect, isPointInRect, rectWidth, rectHeight, sizeToRect } from './geometry.js'
export type { Size, Point, Rectangle } from './geometry.js'
