import React from 'react'
import { Size } from '../types'

export type { Size }

export interface LayoutNode {
  type: 'text' | 'box' | 'element'
  width: number
  height: number
  minWidth: number
  minHeight: number
  flexGrow: number
  flexShrink: number
  flexDirection: 'row' | 'column'
  paddingX: number
  paddingY: number
  children: LayoutNode[]
  content?: string
  props: Record<string, any>
}

const EMOJI_REGEX = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/

export function measureTextWidth(text: string): number {
  if (!text) return 0
  
  let width = 0
  for (const char of text) {
    if (char === '\n') continue
    if (EMOJI_REGEX.test(char)) {
      width += 2
    } else if (CJK_REGEX.test(char)) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

export function measureTextHeight(text: string, maxWidth?: number): number {
  if (!text) return 0
  
  const lines = text.split('\n')
  if (!maxWidth) return lines.length
  
  let height = 0
  for (const line of lines) {
    const lineWidth = measureTextWidth(line)
    height += Math.max(1, Math.ceil(lineWidth / maxWidth))
  }
  return height
}

export function measureText(text: string, maxWidth?: number): Size {
  const lines = text.split('\n')
  let width = 0
  let height = 0
  
  for (const line of lines) {
    const lineWidth = measureTextWidth(line)
    if (maxWidth && lineWidth > maxWidth) {
      width = maxWidth
      height += Math.ceil(lineWidth / maxWidth)
    } else {
      width = Math.max(width, lineWidth)
      height += 1
    }
  }
  
  return { width, height: Math.max(1, height) }
}

export function measureElement(element: React.ReactNode, containerWidth?: number, containerHeight?: number): Size {
  if (element === null || element === undefined) {
    return { width: 0, height: 0 }
  }
  
  if (typeof element === 'string' || typeof element === 'number') {
    return measureText(String(element), containerWidth)
  }
  
  if (element && typeof element === 'object' && 'value' in element && typeof (element as any).value === 'string') {
    const text = (element as any).value || ''
    return measureText(text, containerWidth)
  }
  
  if (!React.isValidElement(element)) {
    return { width: 0, height: 0 }
  }
  
  const props = element.props as any
  const type = element.type
  
  if (props.width !== undefined) {
    return {
      width: typeof props.width === 'number' ? props.width : 0,
      height: props.height !== undefined ? (typeof props.height === 'number' ? props.height : 0) : 1
    }
  }
  
  const children = props.children
  const flexDirection = props.flexDirection || 'row'
  const paddingX = props.paddingX || props.paddingLeft || props.paddingRight || 0
  const paddingY = props.paddingY || props.paddingTop || props.paddingBottom || 0
  
  const innerWidth = containerWidth ? containerWidth - paddingX * 2 : undefined
  const innerHeight = containerHeight ? containerHeight - paddingY * 2 : undefined
  
  let childrenSize = { width: 0, height: 0 }
  
  if (children) {
    const childArray = React.Children.toArray(children)
    
    if (flexDirection === 'column') {
      let maxWidth = 0
      let totalHeight = 0
      
      for (const child of childArray) {
        const childSize = measureElement(child, innerWidth, innerHeight)
        maxWidth = Math.max(maxWidth, childSize.width)
        totalHeight += childSize.height
      }
      
      childrenSize = { width: maxWidth, height: totalHeight }
    } else {
      let totalWidth = 0
      let maxHeight = 0
      
      for (const child of childArray) {
        const childSize = measureElement(child, innerWidth, innerHeight)
        totalWidth += childSize.width
        maxHeight = Math.max(maxHeight, childSize.height)
      }
      
      childrenSize = { width: totalWidth, height: maxHeight }
    }
  }
  
  const borderExtra = props.borderStyle ? 2 : 0
  
  return {
    width: childrenSize.width + paddingX * 2 + borderExtra,
    height: (props.height ?? childrenSize.height) + paddingY * 2 + borderExtra
  }
}

export function measureChildren(children: React.ReactNode, flexDirection: 'row' | 'column' = 'row', containerWidth?: number, containerHeight?: number): Size {
  const childArray = React.Children.toArray(children)
  
  if (childArray.length === 0) {
    return { width: 0, height: 0 }
  }
  
  if (flexDirection === 'column') {
    let maxWidth = 0
    let totalHeight = 0
    
    for (const child of childArray) {
      const size = measureElement(child, containerWidth, containerHeight)
      maxWidth = Math.max(maxWidth, size.width)
      totalHeight += size.height
    }
    
    return { width: maxWidth, height: totalHeight }
  } else {
    let totalWidth = 0
    let maxHeight = 0
    
    for (const child of childArray) {
      const size = measureElement(child, containerWidth, containerHeight)
      totalWidth += size.width
      maxHeight = Math.max(maxHeight, size.height)
    }
    
    return { width: totalWidth, height: maxHeight }
  }
}

export function calculateFlexLayout(
  children: React.ReactNode,
  containerWidth: number,
  containerHeight: number,
  flexDirection: 'row' | 'column' = 'row',
  gap: number = 0
): { positions: Array<{ x: number; y: number; width: number; height: number }> } {
  const childArray = React.Children.toArray(children)
  const positions: Array<{ x: number; y: number; width: number; height: number }> = []
  
  if (childArray.length === 0) {
    return { positions }
  }
  
  const measuredChildren = childArray.map(child => {
    const props = (React.isValidElement(child) ? child.props : {}) as any
    const size = measureElement(child)
    return {
      child,
      size,
      flexGrow: props.flexGrow ?? 0,
      flexShrink: props.flexShrink ?? 1
    }
  })
  
  const totalFixedSize = measuredChildren.reduce((sum, { size, flexGrow }) => {
    return sum + (flexGrow === 0 ? (flexDirection === 'row' ? size.width : size.height) : 0)
  }, 0)
  
  const totalGap = gap * (childArray.length - 1)
  const availableSpace = (flexDirection === 'row' ? containerWidth : containerHeight) - totalFixedSize - totalGap
  const totalFlexGrow = measuredChildren.reduce((sum, { flexGrow }) => sum + flexGrow, 0)
  
  let currentPos = 0
  
  for (const { size, flexGrow } of measuredChildren) {
    let width: number
    let height: number
    
    if (flexDirection === 'row') {
      width = flexGrow > 0 && totalFlexGrow > 0 
        ? size.width + (availableSpace * flexGrow / totalFlexGrow)
        : size.width
      height = containerHeight
      positions.push({ x: currentPos, y: 0, width: Math.floor(width), height })
      currentPos += Math.floor(width) + gap
    } else {
      width = containerWidth
      height = flexGrow > 0 && totalFlexGrow > 0
        ? size.height + (availableSpace * flexGrow / totalFlexGrow)
        : size.height
      positions.push({ x: 0, y: currentPos, width, height: Math.floor(height) })
      currentPos += Math.floor(height) + gap
    }
  }
  
  return { positions }
}
