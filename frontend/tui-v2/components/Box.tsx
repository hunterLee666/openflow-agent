import React from 'react'
import Text, { TextProps } from './Text'

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
  const pr = paddingRight ?? paddingX
  const pt = paddingTop ?? paddingY
  const pb = paddingBottom ?? paddingY

  const childArray = React.Children.toArray(children)
  
  const result: React.ReactNode[] = []
  
  if (flexDirection === 'column') {
    childArray.forEach((child, index) => {
      if (React.isValidElement(child)) {
        const childProps = { ...child.props, y: pt + index * (1 + gap), x: px }
        result.push(React.cloneElement(child, childProps))
      } else if (typeof child === 'string' || typeof child === 'number') {
        result.push(
          React.createElement(Text, {
            key: index,
            y: pt + index * (1 + gap),
            x: px,
            block: true
          }, String(child))
        )
      }
    })
  } else {
    let currentX = px
    childArray.forEach((child, index) => {
      if (React.isValidElement(child)) {
        const childProps = { ...child.props, x: currentX, y: pt }
        result.push(React.cloneElement(child, childProps))
        const text = typeof child.props.children === 'string' ? child.props.children : ''
        currentX += text.length + gap
      } else if (typeof child === 'string' || typeof child === 'number') {
        const text = String(child)
        result.push(
          React.createElement(Text, {
            key: index,
            x: currentX,
            y: pt
          }, text)
        )
        currentX += text.length + gap
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
