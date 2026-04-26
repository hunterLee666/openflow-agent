import React from 'react'
import Text from './Text'
import { Box } from './Box'

export interface OperationNodeData {
  status: 'success' | 'running' | 'pending' | 'error'
  label: string
  duration?: number
  children?: OperationNodeData[]
}

export interface OperationTreeProps {
  nodes: OperationNodeData[]
  title?: string
  indent?: number
}

function renderNode(node: OperationNodeData, indent: number = 0): React.ReactElement[] {
  const prefix = '  '.repeat(indent)
  const icon = node.status === 'success' ? '✔' 
    : node.status === 'running' ? '◉' 
    : node.status === 'error' ? '✗'
    : '○'
  const color = node.status === 'success' ? 'BrightGreen' 
    : node.status === 'running' ? 'BrightMagenta' 
    : node.status === 'error' ? 'BrightRed'
    : 'BrightBlack'

  const elements: React.ReactElement[] = [
    React.createElement(Text, { block: true, key: `${indent}-${node.label}` },
      prefix,
      React.createElement(Text, { color: color }, icon),
      ' ',
      React.createElement(Text, {}, node.label),
      node.duration !== undefined ? 
        React.createElement(Text, { color: 'BrightBlack' }, ` (${node.duration}ms)`) : 
        null
    )
  ]

  if (node.children) {
    node.children.forEach(child => {
      elements.push(...renderNode(child, indent + 1))
    })
  }

  return elements
}

export function OperationTree({ nodes, title, indent = 0 }: OperationTreeProps): React.ReactElement {
  const children: React.ReactElement[] = []

  if (title) {
    children.push(
      React.createElement(Text, { 
        color: 'BrightMagenta', 
        bold: true, 
        block: true, 
        key: 'title' 
      }, `◆ ${title}`)
    )
  }

  nodes.forEach(node => {
    children.push(...renderNode(node, indent))
  })

  return React.createElement(Box, { 
    flexDirection: 'column', 
    paddingX: 1, 
    paddingY: 0
  }, ...children)
}

export default OperationTree
