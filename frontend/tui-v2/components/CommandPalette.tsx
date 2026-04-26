import React from 'react'
import Text from './Text'
import { Box } from './Box'

export interface Command {
  id: string
  label: string
  shortcut?: string
  description?: string
  category?: string
}

export interface CommandPaletteProps {
  commands: Command[]
  selectedIndex?: number
  filter?: string
  visible?: boolean
  onSelect?: (command: Command) => void
}

export function CommandPalette({
  commands,
  selectedIndex = 0,
  filter = '',
  visible = true,
  onSelect
}: CommandPaletteProps): React.ReactElement | null {
  if (!visible) return null

  const filteredCommands = filter
    ? commands.filter(cmd => 
        cmd.label.toLowerCase().includes(filter.toLowerCase()) ||
        cmd.description?.toLowerCase().includes(filter.toLowerCase()) ||
        cmd.category?.toLowerCase().includes(filter.toLowerCase())
      )
    : commands

  const children: React.ReactElement[] = [
    React.createElement(Text, { 
      color: 'BrightMagenta', 
      bold: true, 
      block: true, 
      key: 'title' 
    }, '◆ Command Palette'),
    React.createElement(Text, { 
      color: 'BrightBlack', 
      block: true, 
      key: 'hint' 
    }, filter ? `Filter: ${filter}` : 'Type to filter...'),
    React.createElement(Text, { block: true, key: 'spacer' }, '')
  ]

  let currentCategory = ''
  
  filteredCommands.forEach((cmd, index) => {
    if (cmd.category && cmd.category !== currentCategory) {
      currentCategory = cmd.category
      children.push(
        React.createElement(Text, { 
          color: 'BrightCyan', 
          block: true, 
          key: `cat-${cmd.category}` 
        }, `  [${cmd.category}]`)
      )
    }

    const isSelected = index === selectedIndex
    const prefix = isSelected ? '▸ ' : '  '
    const labelColor = isSelected ? 'BrightMagenta' : 'BrightWhite'
    const descColor = isSelected ? 'BrightBlack' : 'Black'

    children.push(
      React.createElement(Text, { block: true, key: cmd.id },
        React.createElement(Text, { color: isSelected ? 'BrightGreen' : 'BrightBlack' }, prefix),
        React.createElement(Text, { color: labelColor, bold: isSelected }, cmd.label),
        cmd.shortcut ? 
          React.createElement(Text, { color: 'BrightBlack' }, ` [${cmd.shortcut}]`) : 
          null,
        cmd.description ? 
          React.createElement(Text, { color: descColor }, ` - ${cmd.description}`) : 
          null
      )
    )
  })

  if (filteredCommands.length === 0) {
    children.push(
      React.createElement(Text, { 
        color: 'BrightRed', 
        block: true, 
        key: 'no-results' 
      }, '  No commands found')
    )
  }

  children.push(
    React.createElement(Text, { block: true, key: 'footer-spacer' }, ''),
    React.createElement(Text, { 
      color: 'BrightBlack', 
      block: true, 
      key: 'footer' 
    }, '  ↑↓ Navigate  Enter Select  Esc Close')
  )

  return React.createElement(Box, { 
    flexDirection: 'column',
    paddingX: 1,
    paddingY: 0
  }, ...children)
}

export default CommandPalette
