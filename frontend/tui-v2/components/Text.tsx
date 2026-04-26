import { TextProps } from '../types'

export type { TextProps }

export default function Text({ children, ...props }: TextProps) {
  return <text {...props}>{children}</text>
}
