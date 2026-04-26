import React from 'react'
import Text from './Text'
import { Color } from '../types'

export interface KbdProps {
  keys: string | string[]
  description?: string
  color?: Color
  bracketColor?: Color
}

export function Kbd({ keys, description, color = 'BrightWhite', bracketColor = 'BrightBlack' }: KbdProps): React.ReactElement {
  const keyArray = Array.isArray(keys) ? keys : [keys]
  
  const keyElements: React.ReactNode[] = []
  
  keyArray.forEach((key, index) => {
    keyElements.push(
      React.createElement(Text, { color: bracketColor, key: `bracket-${index}` }, '['),
      React.createElement(Text, { color: color, bold: true, key: `key-${index}` }, key),
      React.createElement(Text, { color: bracketColor, key: `bracket-end-${index}` }, ']')
    )
    if (index < keyArray.length - 1) {
      keyElements.push(
        React.createElement(Text, { key: `sep-${index}` }, '+')
      )
    }
  })

  if (description) {
    keyElements.push(
      React.createElement(Text, { color: 'BrightBlack', key: 'desc' }, ` ${description}`)
    )
  }

  return React.createElement(Text, {}, ...keyElements)
}

export default Kbd
