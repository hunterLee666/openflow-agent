import React from 'react'
import { Box } from './Box'
import Text from './Text'

type TabType = 'model' | 'provider' | 'skills' | 'commands' | 'history' | 'operations' | 'settings' | 'shortcuts'

interface OpenFlowSidebarProps {
  provider: string
  model: string
  baseUrl: string
  latency: number
  tokenUsed: number
  tokenTotal: number
  selectedTab?: TabType
  selectedIndex?: number
}

const TABS = [
  { key: 'model', label: '🤖 模型配置' },
  { key: 'provider', label: '🔌 供应商' },
  { key: 'skills', label: '⚡ Skills' },
  { key: 'commands', label: '⌨️ 命令' },
  { key: 'history', label: '💬 历史' },
  { key: 'operations', label: '⚡ 操作' },
  { key: 'settings', label: '⚙️ 设置' },
  { key: 'shortcuts', label: '🎹 快捷键' }
] as const

const PROVIDERS = ['Bailian', 'OpenAI', 'Anthropic', 'Google', 'Azure', 'Cohere']
const SKILLS = [
  { name: 'chart-visualization', desc: '数据可视化图表' },
  { name: 'newsletter-generation', desc: '新闻通讯生成' },
  { name: 'consulting-analysis', desc: '咨询分析报告' },
  { name: 'teach-me', desc: '一对一AI辅导' },
  { name: 'code-documentation', desc: '代码文档生成' },
  { name: 'frontend-design', desc: '前端界面设计' }
]
const COMMANDS = [
  { cmd: '/help', desc: '显示帮助信息' },
  { cmd: '/clear', desc: '清空聊天记录' },
  { cmd: '/model', desc: '切换模型' },
  { cmd: '/compact', desc: '压缩记忆' },
  { cmd: '/settings', desc: '打开设置' },
  { cmd: '/skills', desc: '列出可用技能' }
]
const HISTORY = [
  { id: 'sess-001', name: '项目代码审查', time: '2小时前' },
  { id: 'sess-002', name: '数据分析报告', time: '昨天' },
  { id: 'sess-003', name: '前端界面设计', time: '3天前' }
]
const OPERATIONS = [
  { name: '初始化项目', status: 'success' },
  { name: '代码审查', status: 'running' },
  { name: '生成文档', status: 'pending' }
]
const SETTINGS = [
  { name: '流式输出', enabled: true },
  { name: '自动压缩', enabled: false },
  { name: '记忆提取', enabled: true },
  { name: '工具调用', enabled: true }
]
const SHORTCUTS = [
  { key: 'Enter', desc: '发送消息' },
  { key: '↑/↓', desc: '切换Tab' },
  { key: 'Ctrl+N', desc: '新会话' },
  { key: 'Ctrl+P', desc: '上一个命令' },
  { key: 'Ctrl+B', desc: '切换侧边栏' },
  { key: 'Ctrl+Q', desc: '退出程序' },
  { key: 'Ctrl+C', desc: '取消输入' }
]

export function OpenFlowSidebar({
  provider,
  model,
  baseUrl,
  latency,
  tokenUsed,
  tokenTotal,
  selectedTab = 'model',
  selectedIndex = 0
}: OpenFlowSidebarProps): React.ReactElement {
  const tokenPercent = Math.round((tokenUsed / tokenTotal) * 100)
  const progressBar = '█'.repeat(Math.round(tokenPercent / 5)) + '░'.repeat(20 - Math.round(tokenPercent / 5))
  
  const lines: React.ReactNode[] = []
  
  lines.push(React.createElement(Text, { key: 'title', color: 'BrightMagenta', bold: true }, '◆ 政颐制造 TUI'))
  lines.push(React.createElement(Text, { key: 'version', color: 'BrightBlack', dim: true }, 'v2.0 | 终端界面'))
  lines.push(React.createElement(Text, { key: 'space1', block: true }, ''))
  
  lines.push(React.createElement(Text, { key: 'model-label', color: 'BrightBlack' }, '模型'))
  lines.push(React.createElement(Text, { key: 'model', color: 'BrightWhite', bold: true }, `  🤖 ${model}`))
  lines.push(React.createElement(Text, { key: 'provider', color: 'BrightBlack', dim: true }, `  📦 ${provider}`))
  lines.push(React.createElement(Text, { key: 'latency', color: 'BrightGreen' }, `  ⚡ 延迟: ${latency}ms`))
  lines.push(React.createElement(Text, { key: 'token', color: 'BrightCyan' }, `  💰 Token: ${tokenUsed}/${tokenTotal} [${tokenPercent}%]`))
  lines.push(React.createElement(Text, { key: 'progress', color: 'BrightMagenta' }, `  ${progressBar}`))
  lines.push(React.createElement(Text, { key: 'space2', block: true }, ''))
  
  const currentTab = TABS.find(t => t.key === selectedTab)
  lines.push(React.createElement(Text, { key: 'tab', color: 'BrightMagenta', bold: true }, currentTab?.label || ''))
  lines.push(React.createElement(Text, { key: 'space3', block: true }, ''))
  
  if (selectedTab === 'provider') {
    PROVIDERS.forEach((p, i) => {
      const isSelected = i === selectedIndex
      const prefix = isSelected ? '▶ ' : '  '
      const suffix = p === provider ? ' ✓' : ''
      lines.push(React.createElement(Text, { 
        key: `provider-${p}`, 
        color: isSelected ? 'BrightMagenta' : 'BrightWhite',
        bold: isSelected
      }, prefix + p + suffix))
    })
  } else if (selectedTab === 'skills') {
    SKILLS.forEach((s, i) => {
      const isSelected = i === selectedIndex
      lines.push(React.createElement(Text, { 
        key: `skill-${s.name}`, 
        color: isSelected ? 'BrightMagenta' : 'BrightWhite',
        bold: isSelected
      }, (isSelected ? '▶ ' : '  ') + s.name))
      lines.push(React.createElement(Text, { 
        key: `skill-desc-${s.name}`, 
        color: 'BrightBlack', 
        dim: true 
      }, '    ' + s.desc))
    })
  } else if (selectedTab === 'commands') {
    COMMANDS.forEach((c, i) => {
      const isSelected = i === selectedIndex
      lines.push(React.createElement(Text, { key: `cmd-${c.cmd}`, block: true },
        React.createElement(Text, { 
          color: isSelected ? 'BrightMagenta' : 'BrightWhite',
          bold: isSelected
        }, isSelected ? '▶ ' : '  '),
        React.createElement(Text, { color: 'BrightCyan' }, c.cmd),
        React.createElement(Text, { color: 'BrightBlack', dim: true }, ' - ' + c.desc)
      ))
    })
  } else if (selectedTab === 'history') {
    HISTORY.forEach((h, i) => {
      const isSelected = i === selectedIndex
      lines.push(React.createElement(Text, { 
        key: `hist-${h.id}`, 
        color: isSelected ? 'BrightMagenta' : 'BrightWhite',
        bold: isSelected
      }, (isSelected ? '▶ ' : '  ') + h.name))
      lines.push(React.createElement(Text, { 
        key: `hist-time-${h.id}`, 
        color: 'BrightBlack', 
        dim: true 
      }, '  ' + h.time))
    })
  } else if (selectedTab === 'operations') {
    OPERATIONS.forEach((op, i) => {
      const statusIcon = op.status === 'success' ? '✅' : op.status === 'running' ? '🔄' : '⏳'
      const statusColor = op.status === 'success' ? 'BrightGreen' : op.status === 'running' ? 'BrightYellow' : 'BrightBlack'
      const isSelected = i === selectedIndex
      lines.push(React.createElement(Text, { key: `op-${op.name}`, block: true },
        React.createElement(Text, { 
          color: isSelected ? 'BrightMagenta' : statusColor,
          bold: isSelected
        }, isSelected ? '▶ ' : '  '),
        React.createElement(Text, { color: statusColor }, statusIcon + ' ' + op.name)
      ))
    })
  } else if (selectedTab === 'settings') {
    SETTINGS.forEach((s, i) => {
      const isSelected = i === selectedIndex
      const statusText = s.enabled ? ' [ON]' : ' [OFF]'
      const statusColor = s.enabled ? 'BrightGreen' : 'BrightBlack'
      lines.push(React.createElement(Text, { key: `set-${s.name}`, block: true },
        React.createElement(Text, { 
          color: isSelected ? 'BrightMagenta' : 'BrightWhite',
          bold: isSelected
        }, isSelected ? '▶ ' : '  '),
        React.createElement(Text, { color: 'BrightWhite' }, s.name),
        React.createElement(Text, { color: statusColor, dim: !s.enabled }, statusText)
      ))
    })
  } else if (selectedTab === 'shortcuts') {
    SHORTCUTS.forEach((sh, i) => {
      const isSelected = i === selectedIndex
      lines.push(React.createElement(Text, { key: `sh-${sh.key}`, block: true },
        React.createElement(Text, { 
          color: isSelected ? 'BrightMagenta' : 'BrightWhite',
          bold: isSelected
        }, isSelected ? '▶ ' : '  '),
        React.createElement(Text, { color: 'BrightCyan' }, sh.key.padEnd(8)),
        React.createElement(Text, { color: 'BrightBlack', dim: true }, sh.desc)
      ))
    })
  }
  
  lines.push(React.createElement(Text, { key: 'space4', block: true }, ''))
  lines.push(React.createElement(Text, { key: 'hint', color: 'BrightBlack', dim: true }, '按 ↑/↓ 切换 Tab'))
  
  return React.createElement(Box, { flexDirection: 'column', paddingX: 1 }, ...lines)
}

export default OpenFlowSidebar
