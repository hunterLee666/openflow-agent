import type { KeyBinding } from "./types"

export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  {
    key: "escape",
    action: "exit",
    description: "退出/关闭",
    priority: 100,
  },
  {
    key: "return",
    modifiers: ["ctrl"],
    action: "newLine",
    description: "换行",
  },
  {
    key: "return",
    action: "submit",
    description: "发送消息",
    priority: 10,
  },
  {
    key: "tab",
    action: "focusInput",
    description: "聚焦输入框",
  },
  {
    key: "upArrow",
    action: "scrollUp",
    description: "向上滚动",
  },
  {
    key: "downArrow",
    action: "scrollDown",
    description: "向下滚动",
  },
  {
    key: "k",
    modifiers: ["ctrl"],
    action: "clear",
    description: "清屏",
  },
  {
    key: "l",
    modifiers: ["ctrl"],
    action: "toggleLayout",
    description: "切换布局",
  },
  {
    key: "t",
    modifiers: ["ctrl"],
    action: "toggleTheme",
    description: "切换主题",
  },
  {
    key: "p",
    modifiers: ["ctrl"],
    action: "commandPalette",
    description: "命令面板",
  },
  {
    key: "/",
    action: "slashCommand",
    description: "斜杠命令",
  },
  {
    key: "c",
    modifiers: ["ctrl"],
    action: "interrupt",
    description: "中断",
    priority: 100,
  },
  {
    key: "z",
    modifiers: ["ctrl"],
    action: "undo",
    description: "撤销",
  },
  {
    key: "y",
    modifiers: ["ctrl"],
    action: "redo",
    description: "重做",
  },
  {
    key: "d",
    modifiers: ["ctrl"],
    action: "toggleDebug",
    description: "调试模式",
  },
  {
    key: "h",
    action: "help",
    description: "帮助",
  },
]

export const KEYBINDING_CATEGORIES = {
  navigation: ["scrollUp", "scrollDown", "focusInput"],
  editing: ["submit", "newLine", "undo", "redo"],
  system: ["exit", "clear", "interrupt"],
  ui: ["toggleTheme", "toggleLayout", "toggleDebug"],
  commands: ["commandPalette", "slashCommand", "help"],
} as const
