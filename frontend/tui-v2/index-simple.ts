console.error('开始加载...')

import { createRoot } from './core/renderer'
import React from 'react'

console.error('导入完成')

const ZHENGYI_LOGO = [
  '████████╗██╗  ██╗███████╗',
  '██╔══██╗██║  ██║██╔════╝',
  '██████╔╝███████║█████╗  ',
  '██╔═══╝ ██╔══██║██╔══╝  ',
  '██║     ██║  ██║███████╗',
  '╚═╝     ╚═╝  ╚═╝╚══════╝'
]

function App() {
  console.error('App 组件渲染...')
  return React.createElement('text', {
    color: 'BrightMagenta',
    bold: true
  },
    '政颐制造 TUI v2.0\n',
    '===================\n\n',
    ZHENGYI_LOGO.join('\n'),
    '\n\n',
    '✅ 测试成功!\n',
    '按 Ctrl+C 退出'
  )
}

console.error('创建 root...')
const root = createRoot()
console.error('root 创建完成，开始渲染...')
root.render(React.createElement(App), { fullscreen: true, print: false })
console.error('render 完成')

process.stdin.resume()
