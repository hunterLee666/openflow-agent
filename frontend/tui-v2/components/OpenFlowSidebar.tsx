import React from 'react'
import { Box } from './Box'
import Text from './Text'
import { ProviderItem, SkillItem, CommandItem } from './sidebar-items'

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
  
  return React.createElement(Box, { flexDirection: 'column', paddingX: 1 },
    React.createElement(Text, { color: 'BrightMagenta', bold: true, block: true }, '政颐制造 TUI'),
    React.createElement(Text, { color: 'BrightBlack', dim: true }, 'v2.0 | 终端界面'),
    React.createElement(Text, { block: true }, ''),
    
    React.createElement(Box, { flexDirection: 'column', paddingX: 1, paddingY: 0 },
      React.createElement(Text, { color: 'BrightWhite', bold: true }, `🤖 ${model}`),
      React.createElement(Text, { color: 'BrightBlack', dim: true }, `📦 ${provider}`),
      React.createElement(Text, { color: 'BrightGreen' }, `⚡ 延迟: ${latency}ms`),
      React.createElement(Text, { block: true },
        React.createElement(Text, { color: 'BrightCyan' }, `💰 Token: ${tokenUsed}/${tokenTotal}`),
        React.createElement(Text, { color: 'BrightYellow' }, ` [${tokenPercent}%]`)
      ),
      React.createElement(Text, { color: 'BrightCyan' }, '█'.repeat(Math.round(tokenPercent / 5)))
    ),
    React.createElement(Text, { block: true }, ''),
    
    React.createElement(Box, { flexDirection: 'column', paddingX: 1, paddingY: 0 },
      React.createElement(Text, { 
        color: selectedTab === 'model' ? 'BrightMagenta' : 'BrightBlack', 
        bold: selectedTab === 'model' 
      }, TABS.find(t => t.key === selectedTab)?.label || '未选中')
    ),
    
    React.createElement(Text, { block: true }, ''),
    
    React.createElement(Box, { flexDirection: 'column' },
      selectedTab === 'provider' && React.createElement(Box, { flexDirection: 'column' },
        PROVIDERS.map((p, i) => React.createElement(Text, { 
          key: p, 
          color: i === selectedIndex ? 'BrightMagenta' : 'BrightWhite',
          bold: i === selectedIndex
        }, p === provider ? `▶ ${p}` : `  ${p}`))
      ),
      
      selectedTab === 'skills' && React.createElement(Box, { flexDirection: 'column' },
        SKILLS.map((s, i) => React.createElement(Box, { key: s.name, flexDirection: 'column' },
          React.createElement(Text, { 
            color: i === selectedIndex ? 'BrightMagenta' : 'BrightWhite',
            bold: i === selectedIndex
          }, i === selectedIndex ? '▶ ' : '  ' + s.name),
          React.createElement(Text, { color: 'BrightBlack', dim: true }, '  ' + s.desc)
        ))
      ),
      
      selectedTab === 'commands' && React.createElement(Box, { flexDirection: 'column' },
        COMMANDS.map((c, i) => React.createElement(Text, { key: c.cmd, block: true },
          React.createElement(Text, { 
            color: i === selectedIndex ? 'BrightMagenta' : 'BrightWhite',
            bold: i === selectedIndex
          }, i === selectedIndex ? '▶ ' : '  '),
          React.createElement(Text, { color: 'BrightCyan' }, c.cmd),
          React.createElement(Text, { color: 'BrightBlack', dim: true }, ' - ' + c.desc)
        ))
      ),
      
      selectedTab === 'history' && React.createElement(Box, { flexDirection: 'column' },
        HISTORY.map((h, i) => React.createElement(Box, { key: h.id, flexDirection: 'column' },
          React.createElement(Text, { 
            color: i === selectedIndex ? 'BrightMagenta' : 'BrightWhite',
            bold: i === selectedIndex
          }, i === selectedIndex ? '▶ ' : '  ' + h.name),
          React.createElement(Text, { color: 'BrightBlack', dim: true }, '  ' + h.time)
        ))
      ),
      
      selectedTab === 'operations' && React.createElement(Box, { flexDirection: 'column' },
        OPERATIONS.map((op, i) => {
          const statusIcon = op.status === 'success' ? '✅' : op.status === 'running' ? '🔄' : '⏳'
          const statusColor = op.status === 'success' ? 'BrightGreen' : op.status === 'running' ? 'BrightYellow' : 'BrightBlack'
          return React.createElement(Text, { key: op.name, block: true },
            React.createElement(Text, { 
              color: i === selectedIndex ? 'BrightMagenta' : statusColor,
              bold: i === selectedIndex
            }, i === selectedIndex ? '▶ ' : '  '),
            React.createElement(Text, { color: statusColor }, statusIcon + ' ' + op.name)
          )
        })
      ),
      
      selectedTab === 'settings' && React.createElement(Box, { flexDirection: 'column' },
        SETTINGS.map((s, i) => React.createElement(Text, { key: s.name, block: true },
          React.createElement(Text, { 
            color: i === selectedIndex ? 'BrightMagenta' : 'BrightWhite',
            bold: i === selectedIndex
          }, i === selectedIndex ? '▶ ' : '  '),
          React.createElement(Text, { color: 'BrightWhite' }, s.name),
          React.createElement(Text, { color: s.enabled ? 'BrightGreen' : 'BrightBlack', dim: !s.enabled }, s.enabled ? ' [ON]' : ' [OFF]')
        ))
      ),
      
      selectedTab === 'shortcuts' && React.createElement(Box, { flexDirection: 'column' },
        SHORTCUTS.map((sh, i) => React.createElement(Text, { key: sh.key, block: true },
          React.createElement(Text, { 
            color: i === selectedIndex ? 'BrightMagenta' : 'BrightWhite',
            bold: i === selectedIndex
          }, i === selectedIndex ? '▶ ' : '  '),
          React.createElement(Text, { color: 'BrightCyan' }, sh.key.padEnd(8)),
          React.createElement(Text, { color: 'BrightBlack', dim: true }, sh.desc)
        ))
      )
    ),
    
    React.createElement(Text, { block: true }, ''),
    React.createElement(Text, { color: 'BrightBlack', dim: true }, '按 ↑/↓ 切换 Tab')
  )
}

export default OpenFlowSidebar
