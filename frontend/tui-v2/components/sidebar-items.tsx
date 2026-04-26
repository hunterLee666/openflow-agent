import React from 'react'
import Text from './Text'
import { Box } from './Box'
import { Color } from '../types'

export interface SidebarSectionProps {
  title: string
  icon: string
  children: React.ReactNode
}

export function SidebarSection({ title, icon, children }: SidebarSectionProps): React.ReactElement {
  return React.createElement(Box, { flexDirection: 'column', paddingX: 1, paddingY: 0 },
    React.createElement(Text, { color: 'BrightMagenta', bold: true, block: true }, `${icon} ${title.toUpperCase()}`),
    children
  )
}

export interface ProviderItemProps {
  name: string
  status: 'online' | 'offline'
  isActive?: boolean
}

export function ProviderItem({ name, status, isActive }: ProviderItemProps): React.ReactElement {
  const statusColor = status === 'online' ? 'BrightGreen' : 'BrightBlack'
  const statusText = status === 'online' ? '可用' : '离线'
  const activeText = isActive ? '当前' : ''

  return React.createElement(Text, { block: true },
    React.createElement(Text, { color: statusColor }, '●'),
    ' ',
    React.createElement(Text, { color: isActive ? 'BrightMagenta' : undefined }, name),
    ' ',
    React.createElement(Text, { color: 'BrightBlack' }, activeText || statusText)
  )
}

export interface SkillItemProps {
  icon: string
  name: string
  description: string
  iconColor?: Color
}

export function SkillItem({ icon, name, description, iconColor = 'BrightBlue' }: SkillItemProps): React.ReactElement {
  return React.createElement(Text, { block: true },
    React.createElement(Text, { color: iconColor }, icon),
    ' ',
    React.createElement(Text, { color: 'BrightWhite' }, name),
    ' ',
    React.createElement(Text, { color: 'BrightBlack' }, description)
  )
}

export interface CommandItemProps {
  command: string
  description: string
}

export function CommandItem({ command, description }: CommandItemProps): React.ReactElement {
  return React.createElement(Text, { block: true },
    React.createElement(Text, { color: 'BrightMagenta' }, command),
    ' ',
    React.createElement(Text, { color: 'BrightBlack' }, description)
  )
}

export interface SessionItemProps {
  title: string
  preview: string
  time: string
  isActive?: boolean
}

export function SessionItem({ title, preview, time, isActive }: SessionItemProps): React.ReactElement {
  return React.createElement(Text, { block: true },
    isActive ? React.createElement(Text, { color: 'BrightMagenta' }, '▸ ') : React.createElement(Text, { color: 'BrightBlack' }, '  '),
    React.createElement(Text, { color: isActive ? 'BrightMagenta' : 'BrightWhite' }, title),
    ' ',
    React.createElement(Text, { color: 'BrightBlack' }, `- ${preview}`),
    ' ',
    React.createElement(Text, { color: 'BrightBlack' }, `(${time})`)
  )
}

export interface OperationNodeProps {
  status: 'success' | 'running' | 'pending'
  label: string
}

export function OperationNode({ status, label }: OperationNodeProps): React.ReactElement {
  const icon = status === 'success' ? '✔' : status === 'running' ? '◉' : '○'
  const color = status === 'success' ? 'BrightGreen' : status === 'running' ? 'BrightMagenta' : 'BrightBlack'

  return React.createElement(Text, { block: true },
    React.createElement(Text, { color: color }, icon),
    ' ',
    React.createElement(Text, {}, label)
  )
}

export interface SettingItemProps {
  label: string
  value: string | boolean
}

export function SettingItem({ label, value }: SettingItemProps): React.ReactElement {
  const displayValue = typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : value
  const valueColor = typeof value === 'boolean' ? (value ? 'BrightGreen' : 'BrightBlack') : 'BrightMagenta'

  return React.createElement(Text, { block: true },
    React.createElement(Text, {}, label),
    ' ',
    React.createElement(Text, { color: valueColor }, displayValue)
  )
}

export interface ShortcutItemProps {
  keys: string
  description: string
}

export function ShortcutItem({ keys, description }: ShortcutItemProps): React.ReactElement {
  return React.createElement(Text, { block: true },
    React.createElement(Text, { color: 'BrightMagenta', bold: true }, keys),
    ' ',
    React.createElement(Text, { color: 'BrightBlack' }, description)
  )
}
