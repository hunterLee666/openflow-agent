import { useMemo } from 'react'
import React from 'react'

export interface Size {
  width: number
  height: number
}

export default function useChildrenSize(children: React.ReactNode): Size {
  return useMemo(() => {
    const childArray = React.Children.toArray(children)
    if (childArray.length === 0) {
      return { width: 0, height: 0 }
    }

    let maxWidth = 0
    let totalHeight = 0

    childArray.forEach((child) => {
      if (React.isValidElement(child)) {
        const props = child.props as any
        const childWidth = props.width ?? 0
        const childHeight = props.height ?? 1
        maxWidth = Math.max(maxWidth, childWidth)
        totalHeight += childHeight
      }
    })

    return { width: maxWidth, height: totalHeight }
  }, [children])
}
