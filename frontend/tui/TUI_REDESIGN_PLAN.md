# OpenFlow TUI 重新设计方案

基于 Termcn 框架的 TUI 架构设计文档

## 1. 现有架构分析

### 1.1 当前组件结构

```
frontend/tui/
├── components/          # 23 个 UI 组件
│   ├── Box.tsx         # 基础布局组件
│   ├── Text.tsx        # 文本组件
│   ├── TextInput.tsx   # 输入组件
│   ├── Message.tsx     # 消息组件
│   ├── Messages.tsx    # 消息列表
│   ├── StatusBar.tsx   # 状态栏
│   ├── Help.tsx        # 帮助面板
│   └── ...             # 其他组件
├── hooks/              # 14 个自定义 hooks
│   ├── useInput.ts     # 输入处理
│   ├── useTerminalSize.ts
│   └── ...
├── context/            # React Context
├── vim/                # Vim 模式支持
├── keybindings/        # 快捷键系统
├── termio/             # ANSI 终端处理
└── app.tsx             # 主应用入口
```

### 1.2 核心问题

1. **输入处理冲突**：多个 useInput hook 监听器冲突
2. **组件渲染问题**：numeric 值直接传递给 Ink 组件导致错误
3. **状态管理分散**：多个 Context 导致状态同步困难
4. **测试困难**：终端输出难以断言和验证

## 2. Termcn 架构优势

### 2.1 核心特性

- **AI 专用组件**：ChatMessage、ToolApproval、StreamingText、ThinkingBlock
- **主题自适应**：自动适配终端主题
- **零配置**：开箱即用
- **shadcn/ui 兼容**：组件化设计，易于扩展

### 2.2 组件映射

| 现有组件 | Termcn 替代 | 说明 |
|---------|------------|------|
| Box.tsx | `<Box>` | 直接使用 Termcn 的 Box |
| Text.tsx | `<Text>` | 直接使用 Termcn 的 Text |
| TextInput.tsx | `<Input>` | Termcn 的输入组件 |
| Message.tsx | `<ChatMessage>` | AI 专用消息组件 |
| Messages.tsx | `<ChatContainer>` | 对话容器 |
| StatusBar.tsx | 自定义 | 使用 Termcn 基础组件构建 |
| Help.tsx | `<Dialog>` + `<Tabs>` | 帮助面板 |
| Spinner.tsx | `<Spinner>` | 直接使用 Termcn 的 Spinner |

## 3. 新架构设计

### 3.1 目录结构

```
frontend/tui/
├── components/                    # UI 组件
│   ├── base/                     # 基础组件（来自 Termcn）
│   │   ├── Box.tsx
│   │   ├── Text.tsx
│   │   ├── Input.tsx
│   │   └── Spinner.tsx
│   ├── ai/                       # AI 专用组件
│   │   ├── ChatMessage.tsx       # 消息组件
│   │   ├── ChatContainer.tsx     # 对话容器
│   │   ├── ToolApproval.tsx      # 工具审批
│   │   ├── StreamingText.tsx     # 流式文本
│   │   └── ThinkingBlock.tsx     # 思考块
│   ├── layout/                   # 布局组件
│   │   ├── AppLayout.tsx         # 主布局
│   │   ├── StatusBar.tsx         # 状态栏
│   │   ├── Sidebar.tsx           # 侧边栏
│   │   └── CommandPalette.tsx    # 命令面板
│   ├── dialogs/                  # 对话框
│   │   ├── HelpDialog.tsx
│   │   ├── ExitDialog.tsx
│   │   └── SettingsDialog.tsx
│   └── index.ts                  # 统一导出
├── hooks/                        # 自定义 Hooks
│   ├── useInput.ts               # 输入处理（简化）
│   ├── useTerminalSize.ts        # 终端尺寸
│   ├── useChat.ts                # 对话状态
│   └── useTheme.ts               # 主题管理
├── services/                     # 服务层
│   ├── websocket.ts              # WebSocket 连接
│   ├── llm-client.ts             # LLM 客户端
│   └── config-manager.ts         # 配置管理
├── store/                        # 状态管理
│   ├── chat-store.ts             # 对话状态
│   ├── ui-store.ts               # UI 状态
│   └── settings-store.ts         # 设置状态
├── theme/                        # 主题配置
│   └── openflow-theme.ts         # OpenFlow 主题
├── app.tsx                       # 主应用
└── index.ts                      # 入口文件
```

### 3.2 核心组件设计

#### 3.2.1 AppLayout.tsx

```tsx
import { Box, Text } from "termcn";
import { StatusBar } from "./layout/StatusBar";
import { ChatContainer } from "./ai/ChatContainer";
import { Input } from "./base/Input";

interface AppLayoutProps {
  title: string;
  enableVimMode: boolean;
}

export function AppLayout({ title, enableVimMode }: AppLayoutProps) {
  return (
    <Box flexDirection="column" height="100%">
      <StatusBar title={title} />
      <ChatContainer />
      <Input placeholder="Type a message..." />
    </Box>
  );
}
```

#### 3.2.2 ChatMessage.tsx

```tsx
import { ChatMessage as TermcnChatMessage } from "termcn";

interface OpenFlowChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  tokens?: number;
}

export function ChatMessage({ role, content, timestamp, tokens }: OpenFlowChatMessageProps) {
  return (
    <TermcnChatMessage
      role={role}
      content={content}
      metadata={{
        timestamp: timestamp.toLocaleTimeString(),
        tokens: tokens ? `${tokens} tokens` : undefined,
      }}
    />
  );
}
```

### 3.3 状态管理设计

使用 Zustand 进行状态管理：

```tsx
// store/chat-store.ts
import { create } from "zustand";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  tokens?: number;
}

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,
  error: null,
  
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  
  clearMessages: () => set({ messages: [] }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
```

### 3.4 输入处理设计

简化输入处理，避免多个监听器冲突：

```tsx
// hooks/useInput.ts
import { useInput as useTermcnInput } from "termcn";

interface UseOpenFlowInputOptions {
  onSend?: (message: string) => void;
  onClear?: () => void;
  onHelp?: () => void;
  onExit?: () => void;
  enableVimMode?: boolean;
}

export function useOpenFlowInput({
  onSend,
  onClear,
  onHelp,
  onExit,
  enableVimMode = false,
}: UseOpenFlowInputOptions) {
  useTermcnInput({
    onEnter: (value) => onSend?.(value),
    onCtrlC: onExit,
    onCtrlL: onClear,
    onCtrlH: onHelp,
    vimMode: enableVimMode,
  });
}
```

## 4. 迁移计划

### 4.1 阶段一：基础组件迁移（1-2 天）

1. 安装 Termcn
2. 替换 Box、Text、TextInput 基础组件
3. 更新主题配置
4. 验证基础渲染

### 4.2 阶段二：AI 组件迁移（2-3 天）

1. 替换 Message、Messages 组件
2. 集成 ChatMessage、ChatContainer
3. 更新消息流处理
4. 验证对话功能

### 4.3 阶段三：布局和导航（1-2 天）

1. 重构 AppLayout
2. 替换 StatusBar
3. 更新快捷键系统
4. 验证导航功能

### 4.4 阶段四：对话框和辅助功能（1-2 天）

1. 替换 Help、ExitFlow、Dialog 组件
2. 更新通知系统
3. 验证所有对话框功能

### 4.5 阶段五：测试和优化（1-2 天）

1. 运行所有 E2E 测试
2. 修复发现的问题
3. 性能优化
4. 文档更新

## 5. 风险评估

### 5.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Termcn 不成熟 | 高 | 保留回退方案，可以切换回 Ink |
| API 不兼容 | 中 | 逐步迁移，每个阶段验证 |
| 性能问题 | 中 | 性能测试，必要时优化 |

### 5.2 时间风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 学习成本 | 低 | Termcn API 与 Ink 相似 |
| 调试困难 | 中 | 分阶段验证，及时修复 |

## 6. 成功标准

1. ✅ 所有现有功能正常工作
2. ✅ E2E 测试通过率 > 90%
3. ✅ 启动时间不增加
4. ✅ 内存使用不增加
5. ✅ 代码复杂度降低

## 7. 下一步行动

1. [ ] 安装 Termcn 并验证基础功能
2. [ ] 创建新的组件目录结构
3. [ ] 开始阶段一迁移
4. [ ] 编写迁移测试
