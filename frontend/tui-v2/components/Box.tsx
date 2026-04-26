import React from 'react'
import Text, { TextProps } from './Text'
import { measureElement } from '../core/layout'

export interface BoxProps extends TextProps {
  flexDirection?: 'row' | 'column'
  gap?: number
  paddingX?: number
  paddingY?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  width?: number | string
  height?: number | string
  children?: React.ReactNode
}

export function Box({
  flexDirection = 'row',
  gap = 0,
  paddingX = 0,
  paddingY = 0,
  paddingLeft,
  paddingRight,
  paddingTop,
  paddingBottom,
  children,
  ...props
}: BoxProps): React.ReactElement {
  const px = paddingLeft ?? paddingX
  const pt = paddingTop ?? paddingY

  const childArray = React.Children.toArray(children).filter(c => c !== null && c !== undefined)
  
  const result: React.ReactNode[] = []
  
  if (flexDirection === 'column') {
    let currentY = pt
    
    childArray.forEach((child, index) => {
      if (React.isValidElement(child)) {
        const childSize = measureElement(child)
        const childProps = { 
          ...child.props, 
          y: currentY, 
          x: px 
        }
        result.push(React.cloneElement(child, childProps))
        currentY += childSize.height + gap
      } else if (typeof child === 'string' || typeof child === 'number') {
        const text = String(child)
        const lines = text.split('\n')
        result.push(
          React.createElement(Text, {
            key: index,
            y: currentY,
            x: px,
            block: true
          }, text)
        )
        currentY += lines.length + gap
      }
    })
  } else {
    let currentX = px
    
    childArray.forEach((child, index) => {
      if (React.isValidElement(child)) {
        const childSize = measureElement(child)
        const childProps = { 
          ...child.props, 
          x: currentX
        }
        if (child.props.y === undefined) {
          childProps.y = pt
        }
        result.push(React.cloneElement(child, childProps))
        currentX += (child.props.width ?? childSize.width) + gap
      } else if (typeof child === 'string' || typeof child === 'number') {
        const text = String(child)
        const textWidth = measureElement(text).width
        result.push(
          React.createElement(Text, {
            key: index,
            x: currentX,
            y: pt
          }, text)
        )
        currentX += textWidth + gap
      }
    })
  }

  return React.createElement(
    Text,
    { ...props, block: true },
    ...result
  ) as React.ReactElement
}

export default Box
