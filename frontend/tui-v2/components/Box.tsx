import React from 'react'
import Text, { TextProps } from './Text'
import useChildrenSize from '../hooks/useChildrenSize'
import { Color } from '../types'

export interface BoxProps extends TextProps {
  flexDirection?: 'row' | 'column'
  flexGrow?: number
  paddingX?: number
  paddingY?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  borderStyle?: 'single' | 'double' | 'rounded'
  borderColor?: Color
  children?: React.ReactNode
}

const BORDER_CHARS = {
  single: ['┌', '─', '┐', '│', '└', '┘'],
  double: ['╔', '═', '╗', '║', '╚', '╝'],
  rounded: ['╭', '─', '╮', '│', '╰', '╯']
}

export function Box({
  flexDirection = 'row',
  flexGrow,
  paddingX = 0,
  paddingY = 0,
  paddingLeft,
  paddingRight,
  paddingTop,
  paddingBottom,
  borderStyle,
  borderColor,
  children,
  ...props
}: BoxProps): React.ReactElement {
  const px = paddingLeft ?? paddingX
  const pr = paddingRight ?? paddingX
  const pt = paddingTop ?? paddingY
  const pb = paddingBottom ?? paddingY

  const size = useChildrenSize(children)
  const width = props.width ?? (typeof size.width === 'number' ? size.width + px + pr : undefined)
  const height = props.height ?? (typeof size.height === 'number' ? size.height + pt + pb : undefined)

  const border = borderStyle ? BORDER_CHARS[borderStyle] : null

  if (flexDirection === 'column') {
    const content = (
      <Text {...props} width={width} height={height} block>
        {border && (
          <Text color={borderColor} block>
            {border[0]}
            {border[1].repeat((typeof width === 'number' ? width : 0) - 2)}
            {border[2]}
          </Text>
        )}
        {border && <Text block>{' '.repeat((typeof width === 'number' ? width : 0) - 2)}</Text>}
        {React.Children.map(children, (child, i) => (
          <Text y={pt + i} x={px} block>
            {child}
          </Text>
        ))}
        {border && (
          <Text y={(typeof height === 'number' ? height : 0) - 1} color={borderColor} block>
            {border[4]}
            {border[1].repeat((typeof width === 'number' ? width : 0) - 2)}
            {border[5]}
          </Text>
        )}
      </Text>
    )
    return content as React.ReactElement
  }

  return (
    <Text {...props} width={width} height={height} block>
      {React.Children.map(children, (child, i) => {
        const childWidth = typeof child === 'object' && child !== null && 'props' in child
          ? (child as any).props.width ?? 0
          : 0
        const x = px + i * (typeof childWidth === 'number' ? childWidth : 0)
        return (
          <Text y={pt} x={x} block>
            {child}
          </Text>
        )
      })}
    </Text>
  )
}

export default Box
