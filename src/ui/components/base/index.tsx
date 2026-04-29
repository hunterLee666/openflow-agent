/**
 * 基础UI组件库
 * 提供统一的视觉样式和布局组件
 */

import React from 'react'
import { Box, Text } from 'ink'
import { getTheme } from '@utils/theme'

/**
 * 卡片容器组件
 * 统一的圆角边框、背景、间距
 */
export interface CardProps {
  children: React.ReactNode
  /** 标题（可选） */
  title?: React.ReactNode
  /** 边框颜色主题键，默认使用 border */
  borderColorKey?: 'border' | 'borderMuted' | 'secondaryBorder'
  /** 内边距 X */
  paddingX?: number
  /** 内边距 Y */
  paddingY?: number
  /** 外边距 (所有方向) */
  margin?: number
  /** 上外边距 */
  marginTop?: number
  /** 下外边距 */
  marginBottom?: number
  /** 是否显示背景高亮 */
  highlighted?: boolean
  /** 自定义边框样式 */
  borderStyle?: 'round' | 'single' | 'bold'
  /** 宽度 */
  width?: number | string
}

export function Card({
  children,
  title,
  borderColorKey = 'border',
  paddingX = 1,
  paddingY = 1,
  margin,
  marginTop,
  marginBottom,
  highlighted = false,
  borderStyle = 'round',
  width,
}: CardProps) {
  const theme = getTheme()
  const borderColor = borderColorKey ? theme[borderColorKey] : theme.border
  const bgColor = highlighted ? theme.bgSurfaceHighlight : 'transparent'

  return (
    <Box
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={paddingX}
      paddingY={paddingY}
      margin={margin}
      marginTop={marginTop}
      marginBottom={marginBottom}
      backgroundColor={bgColor}
      width={width}
      flexDirection="column"
    >
      {title && (
        <Text bold color={theme.primary}>
          {title}
        </Text>
      )}
      {children}
    </Box>
  )
}

/**
 * 徽章/标签组件
 * 用于状态指示、类型标识等
 */
export interface BadgeProps {
  children: React.ReactNode
  /** 颜色类型 */
  color?: 'primary' | 'success' | 'error' | 'warning' | 'info' | 'muted'
  /** 是否为实心背景 */
  solid?: boolean
  /** 是否加粗 */
  bold?: boolean
}

export function Badge({
  children,
  color = 'primary',
  solid = false,
  bold = true,
}: BadgeProps) {
  const theme = getTheme()
  const colorMap = {
    primary: theme.primary,
    success: theme.success,
    error: theme.error,
    warning: theme.warning,
    info: theme.info,
    muted: theme.textMuted,
  }
  const textColor = colorMap[color]

  return (
    <Box
      backgroundColor={solid ? textColor + '20' : 'transparent'} // 20% 透明度
      paddingX={1}
    >
      <Text bold={bold} color={textColor}>
        {children}
      </Text>
    </Box>
  )
}

/**
 * 区块标题组件
 * 用于分隔不同功能区域
 */
export interface SectionHeaderProps {
  title: string
  /** 左侧标记颜色 */
  markerColor?: 'primary' | 'info' | 'success' | 'warning' | 'error'
  /** 是否显示底部分隔线 */
  showDivider?: boolean
}

export function SectionHeader({
  title,
  markerColor = 'primary',
  showDivider = true,
}: SectionHeaderProps) {
  const theme = getTheme()
  const markerMap: Record<string, string> = {
    primary: theme.primary,
    info: theme.info,
    success: theme.success,
    warning: theme.warning,
    error: theme.error,
  }
  const marker = markerMap[markerColor] || theme.primary

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box alignItems="center" gap={1}>
        <Box width={1} height={1} backgroundColor={marker} />
        <Text bold color={theme.text} dimColor>
          {title}
        </Text>
      </Box>
      {showDivider && (
        <Box marginTop={0}>
          <Text color={theme.borderMuted}></Text>
        </Box>
      )}
    </Box>
  )
}

/**
 * 分隔线组件
 */
export interface DividerProps {
  /** 样式类型 */
  style?: 'solid' | 'dashed' | 'dotted'
  /** 颜色键 */
  colorKey?: 'border' | 'borderMuted' | 'secondaryBorder'
  /** 上下边距 */
  marginY?: number
}

export function Divider({
  style = 'solid',
  colorKey = 'borderMuted',
  marginY = 0,
}: DividerProps) {
  const theme = getTheme()
  const color = colorKey ? theme[colorKey] : theme.border
  const char = style === 'dashed' ? '┄' : style === 'dotted' ? '┈' : '─'

  return (
    <Box marginY={marginY}>
      <Text color={color}>{char.repeat(80)}</Text>
    </Box>
  )
}

/**
 * 状态指示器组件
 * 小圆点 + 文本
 */
export interface StatusIndicatorProps {
  status: 'active' | 'idle' | 'error' | 'warning' | 'success'
  label?: string
}

export function StatusIndicator({ status, label }: StatusIndicatorProps) {
  const theme = getTheme()
  const statusColors = {
    active: theme.info,
    idle: theme.textMuted,
    error: theme.error,
    warning: theme.warning,
    success: theme.success,
  }
  const color = statusColors[status]
  const dot = '●'

  return (
    <Box gap={1} alignItems="center">
      <Text color={color}>{dot}</Text>
      {label && (
        <Text color={theme.textDim} dimColor>
          {label}
        </Text>
      )}
    </Box>
  )
}
