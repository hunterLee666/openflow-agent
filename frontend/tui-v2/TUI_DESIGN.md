# OpenFlow TUI v2 - 高性能终端 UI 设计方案

## 🎨 美学方向

**风格**: 赛博朋克工业终端 (Cyberpunk Industrial Terminal)

**灵感来源**:
- Matrix 磷光绿终端美学
- 现代 IDE 的精致色彩系统
- 工业控制面板的功能性布局

**核心原则**:
1. **功能性优先** - 每个视觉元素都有明确目的
2. **色彩层次** - 使用 8 色基础 ANSI + 256 色扩展
3. **性能至上** - 60fps 增量渲染，只绘制变化字符
4. **AI 原生** - 专为 LLM 对话优化的组件设计

## 🏗️ 架构设计

```
React-Curse 渲染引擎 (底层)
    ↓ 高性能渲染
    - 增量渲染 (只绘制变化字符)
    - 60fps 节流
    - 差异缓冲区比较
    
Visulima AI 组件 (中层)
    ↓ 业务逻辑
    - MessageBubble (消息气泡)
    - StreamingText (流式文本)
    - OperationTree (操作树)
    - ModelBadge (模型徽章)
    
OpenFlow 适配层 (上层)
    ↓ 对接后端
    - WebSocket 通信
    - 状态管理
    - 用户输入处理
```

## 📐 组件系统

### 核心组件 (来自 React-Curse)
- `Text` - 基础文本渲染
- `Box` - 布局容器
- `Input` - 输入框
- `Spinner` - 加载动画
- `List` - 列表导航
- `View` - 滚动视口

### AI 专用组件 (来自 Visulima)
- `MessageBubble` - 聊天消息气泡
- `StreamingText` - 打字机效果
- `OperationTree` - 操作进度树
- `ModelBadge` - 模型信息徽章
- `StatusLine` - 状态栏
- `Kbd` - 快捷键显示

### 布局组件
- `AppLayout` - 主应用布局
- `ChatContainer` - 对话容器
- `Sidebar` - 侧边栏
- `CommandPalette` - 命令面板

## 🎨 色彩系统

### 基础 ANSI 色彩
```typescript
const COLORS = {
  // 基础 8 色
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  
  // 高亮 8 色
  brightBlack: 90,
  brightRed: 91,
  brightGreen: 92,
  brightYellow: 93,
  brightBlue: 94,
  brightMagenta: 95,
  brightCyan: 96,
  brightWhite: 97,
}
```

### 语义色彩映射
```typescript
const SEMANTIC_COLORS = {
  // 用户消息
  user: 'brightGreen',
  userBorder: 'green',
  
  // AI 助手消息
  assistant: 'brightBlue',
  assistantBorder: 'blue',
  
  // 系统消息
  system: 'brightBlack',
  systemBorder: 'gray',
  
  // 工具调用
  tool: 'brightMagenta',
  toolBorder: 'magenta',
  
  // 状态指示
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'cyan',
  thinking: 'yellow',
  streaming: 'green',
}
```

## ⚡ 性能优化

### 增量渲染
```typescript
// 只渲染变化的字符
const diffLine = line.map((char, x) => {
  const [prevChar, prevModifier] = prevLine?.[x] ?? [' ', {}]
  const [currChar, currModifier] = char
  return prevChar !== currChar || 
         JSON.stringify(prevModifier) !== JSON.stringify(currModifier) 
    ? char 
    : null
}).filter(Boolean)
```

### 60fps 节流
```typescript
private throttle = () => {
  const now = Date.now()
  const nextFrame = Math.max(0, 1000 / 60 - (now - this.lastFrame))
  clearTimeout(this.timeout)
  this.timeout = setTimeout(() => {
    this.lastFrame = now
    this.render()
  }, nextFrame)
}
```

### 缓冲区优化
```typescript
// 使用二维字符数组作为缓冲区
type Char = [string, Modifier]
type Buffer = Char[][]

// 只比较变化的行
if (buffer[y] !== prevBuffer[y]) {
  renderLine(y)
}
```

## 📊 组件性能对比

| 组件 | Ink 渲染 | React-Curse 渲染 | 性能提升 |
|------|----------|------------------|----------|
| Text | 全量重绘 | 增量渲染 | ~3x |
| MessageBubble | 全量重绘 | 差异渲染 | ~2.5x |
| StreamingText | 全量重绘 | 字符级更新 | ~4x |
| OperationTree | 全量重绘 | 节点级更新 | ~3x |

## 🚀 实施计划

### Phase 1: 核心引擎 (已完成)
- [x] React-Curse 渲染引擎移植
- [x] 增量渲染实现
- [x] 60fps 节流机制

### Phase 2: AI 组件 (进行中)
- [ ] MessageBubble 组件
- [ ] StreamingText 组件
- [ ] OperationTree 组件
- [ ] ModelBadge 组件

### Phase 3: 布局系统
- [ ] AppLayout 主布局
- [ ] ChatContainer 对话容器
- [ ] Sidebar 侧边栏

### Phase 4: 集成测试
- [ ] 对接后端 WebSocket
- [ ] 端到端测试
- [ ] 性能基准测试
