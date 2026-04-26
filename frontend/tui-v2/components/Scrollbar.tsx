import Text from './Text'
import { Color } from '../types'

export interface ScrollbarProps {
  offset: number
  limit: number
  length: number
  background?: Color
  color?: Color
}

export default function Scrollbar({ offset, limit, length, background = 'BrightBlack', color = 'BrightWhite' }: ScrollbarProps) {
  const scrollbarHeight = Math.max(1, Math.floor((limit / length) * limit))
  const scrollbarOffset = Math.floor((offset / length) * limit)

  const chars: React.ReactNode[] = []
  
  for (let i = 0; i < limit; i++) {
    const isScrollbar = i >= scrollbarOffset && i < scrollbarOffset + scrollbarHeight
    chars.push(
      <Text key={i} y={i} color={isScrollbar ? color : background}>
        │
      </Text>
    )
  }

  return <>{chars}</>
}
