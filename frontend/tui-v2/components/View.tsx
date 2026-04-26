import React from 'react'
import Text, { TextProps } from './Text'
import { measureChildren } from '../core/layout'

export interface ViewProps extends TextProps {
  height?: number
  width?: number
  scrollY?: number
  scrollX?: number
  overflow?: 'visible' | 'hidden' | 'scroll'
  children?: React.ReactNode
}

export function View({
  height,
  width,
  scrollY = 0,
  scrollX = 0,
  overflow = 'hidden',
  children,
  ...props
}: ViewProps): React.ReactElement {
  const childArray = React.Children.toArray(children)
  const childrenSize = measureChildren(children, 'column')
  
  const viewHeight = height ?? childrenSize.height
  const viewWidth = width ?? childrenSize.width
  
  const scrollbarWidth = overflow === 'scroll' && childrenSize.height > viewHeight ? 1 : 0
  
  const elements: React.ReactNode[] = []
  
  const visibleStartY = Math.max(0, scrollY)
  const visibleEndY = Math.min(childrenSize.height, scrollY + viewHeight)
  
  childArray.forEach((child, index) => {
    if (React.isValidElement(child)) {
      const childProps = (child.props as any) || {}
      const childY = childProps.y ?? index
      const adjustedY = childY - scrollY
      
      if (adjustedY >= 0 && adjustedY < viewHeight) {
        const clippedChild = React.cloneElement(child as React.ReactElement<any>, {
          key: index,
          y: adjustedY,
          x: (childProps.x ?? 0) - scrollX
        })
        elements.push(clippedChild)
      }
    } else if (typeof child === 'string' || typeof child === 'number') {
      const adjustedY = index - scrollY
      if (adjustedY >= 0 && adjustedY < viewHeight) {
        elements.push(
          React.createElement(
            Text,
            { key: index, y: adjustedY, x: -scrollX },
            String(child)
          )
        )
      }
    }
  })
  
  if (overflow === 'scroll' && childrenSize.height > viewHeight) {
    const scrollThumbSize = Math.max(1, Math.floor((viewHeight / childrenSize.height) * viewHeight))
    const scrollThumbPos = Math.floor((scrollY / (childrenSize.height - viewHeight)) * (viewHeight - scrollThumbSize))
    
    for (let i = 0; i < viewHeight; i++) {
      const char = i >= scrollThumbPos && i < scrollThumbPos + scrollThumbSize ? '█' : '░'
      elements.push(
        React.createElement(
          Text,
          { key: `scroll-${i}`, y: i, x: viewWidth - scrollbarWidth, color: 'BrightBlack' },
          char
        )
      )
    }
  }
  
  return React.createElement(
    Text,
    {
      ...props,
      height: viewHeight,
      width: viewWidth - scrollbarWidth,
      block: true
    },
    ...elements
  ) as React.ReactElement
}

export default View
