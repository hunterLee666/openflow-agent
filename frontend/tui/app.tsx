import React, { useState, useCallback, useEffect, useRef } from "react"
import { Box, Text, useInput, useApp } from "ink"
import { useTheme } from "@/contexts/theme-context"
import { useAppContext } from "@/contexts/app-context"
import { useModalContext } from "@/contexts/modal-context"
import { useNotificationContext } from "@/contexts/notification-context"
import { useTerminalSize } from "@/hooks/use-terminal-size"
import { useTextInput } from "@/hooks/use-text-input"
import { AppHeader } from "@/components/app-header"
import { ChatThread } from "@/components/chat-thread"
import { ChatMessage } from "@/components/chat-message"
import { TextInput } from "@/components/text-input"
import { StatusBar } from "@/components/status-bar"
import { LoadingIndicator } from "@/components/loading-indicator"
import { CommandPalette } from "@/components/command-palette"
import { Dialog } from "@/components/dialog"
import { TaskPanel } from "@/components/task-panel"
import { NotificationPanel } from "@/components/notification-panel"
import { HelpPanel } from "@/components/help-panel"
import { Tabs } from "@/components/tabs"
import { globalKeyResolver } from "@/keybindings"
import { DEFAULT_KEYBINDINGS } from "@/keybindings/schema"
import type { Message } from "@/types"
import type { Task as TaskType } from "@/components"
import type { Notification } from "@/components"

const COMMANDS = [
  {
    id: "clear",
    label: "清屏",
    description: "清除所有消息",
    shortcut: "Ctrl+K",
    action: () => {},
  },
  {
    id: "theme",
    label: "切换主题",
    description: "循环切换主题",
    shortcut: "Ctrl+T",
    action: () => {},
  },
  {
    id: "help",
    label: "帮助",
    description: "显示快捷键",
    shortcut: "Ctrl+H",
    action: () => {},
  },
  {
    id: "compact",
    label: "压缩对话",
    description: "压缩上下文",
    shortcut: "Ctrl+M",
    action: () => {},
  },
  {
    id: "export",
    label: "导出对话",
    description: "导出为 Markdown",
    shortcut: "Ctrl+E",
    action: () => {},
  },
  {
    id: "settings",
    label: "设置",
    description: "打开设置面板",
    shortcut: "Ctrl+,",
    action: () => {},
  },
]

export const App = () => {
  const { theme, themeName, setTheme } = useTheme()
  const { state: appState, dispatch, addMessage, clearMessages } = useAppContext()
  const { modal, openModal, closeModal, toggleModal } = useModalContext()
  const { notifications, addNotification, dismissNotification } = useNotificationContext()
  const { columns, rows } = useTerminalSize()

  const [tasks, setTasks] = useState<TaskType[]>([])
  const [activeTab, setActiveTab] = useState("chat")
  const [showHelp, setShowHelp] = useState(false)
  const keybindingsInitialized = useRef(false)

  useEffect(() => {
    if (keybindingsInitialized.current) return
    keybindingsInitialized.current = true

    globalKeyResolver.addBindings(DEFAULT_KEYBINDINGS)

    globalKeyResolver.register("exit", () => {
      process.exit(0)
    })

    globalKeyResolver.register("clear", () => {
      clearMessages()
      addNotification({ type: "info", message: "已清屏" })
    })

    globalKeyResolver.register("toggleTheme", () => {
      const themes = ["default", "atomOne", "dracula", "github"]
      const currentIndex = themes.indexOf(themeName)
      const nextIndex = (currentIndex + 1) % themes.length
      setTheme(themes[nextIndex] as any)
      addNotification({ type: "success", message: `主题已切换为: ${themes[nextIndex]}` })
    })

    globalKeyResolver.register("commandPalette", () => {
      toggleModal("commandPalette")
    })

    globalKeyResolver.register("help", () => {
      setShowHelp((prev) => !prev)
    })
  }, [clearMessages, addNotification, themeName, setTheme, toggleModal])

  const {
    value: inputValue,
    cursorPosition,
    isFocused,
    setValue: setInputValue,
    setIsFocused,
    submit: handleSubmit,
  } = useTextInput({
    onSubmit: (value) => {
      const userMessage: Message = {
        id: Date.now().toString(),
        sender: "user",
        content: value,
        timestamp: new Date(),
      }
      addMessage(userMessage)
      dispatch({ type: "SET_LOADING", payload: true })

      setTimeout(() => {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          sender: "assistant",
          content: `收到你的消息: "${value}"\n\n这是基于 Qwen Code CLI 架构的全新实现！`,
          timestamp: new Date(),
        }
        addMessage(assistantMessage)
        dispatch({ type: "SET_LOADING", payload: false })
      }, 1000)
    },
  })

  useInput((input, key) => {
    const modifiers: string[] = []
    if (key.ctrl) modifiers.push("ctrl")
    if (key.shift) modifiers.push("shift")
    if (key.meta) modifiers.push("meta")

    if (modal.isOpen) return

    globalKeyResolver.execute(input, modifiers)
  })

  const chatHeight = Math.max(8, rows - 14)

  const handleCommandAction = useCallback((commandId: string) => {
    switch (commandId) {
      case "clear":
        clearMessages()
        break
      case "theme":
        const themes = ["default", "atomOne", "dracula", "github"]
        const currentIndex = themes.indexOf(themeName)
        const nextIndex = (currentIndex + 1) % themes.length
        setTheme(themes[nextIndex] as any)
        break
      case "help":
        setShowHelp(true)
        break
    }
    closeModal()
  }, [clearMessages, themeName, setTheme, closeModal])

  const commandsWithActions = COMMANDS.map((cmd) => ({
    ...cmd,
    action: () => handleCommandAction(cmd.id),
  }))

  const keybindings = [
    { keys: "Ctrl+P", description: "命令面板" },
    { keys: "Ctrl+T", description: "切换主题" },
    { keys: "Ctrl+K", description: "清屏" },
    { keys: "Ctrl+H", description: "帮助" },
    { keys: "Ctrl+L", description: "切换布局" },
    { keys: "Enter", description: "发送消息" },
    { keys: "Esc", description: "退出/关闭" },
    { keys: "↑/↓", description: "滚动/历史" },
  ]

  return (
    <Box flexDirection="column" width={columns} paddingX={1}>
      <AppHeader />

      <Box flexDirection="row" paddingY={1}>
        <Tabs
          tabs={[
            { id: "chat", label: "对话" },
            { id: "tasks", label: "任务", badge: tasks.filter((t) => t.status === "running").length },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </Box>

      <Box flexDirection="column">
        <Text color={theme.gray}>{"─".repeat(Math.min(columns - 2, 80))}</Text>
      </Box>

      {activeTab === "chat" && (
        <Box flexDirection="column" paddingY={1}>
          <ChatThread maxHeight={chatHeight}>
            {appState.messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                sender={msg.sender}
                timestamp={msg.timestamp}
                content={msg.content}
                streaming={msg.streaming}
                toolName={msg.toolName}
                toolStatus={msg.toolStatus}
              />
            ))}
          </ChatThread>

          {appState.isLoading && (
            <Box paddingY={1}>
              <LoadingIndicator message="Thinking" />
            </Box>
          )}
        </Box>
      )}

      {activeTab === "tasks" && (
        <Box flexDirection="column" paddingY={1} height={chatHeight}>
          <TaskPanel tasks={tasks} title="任务面板" />
        </Box>
      )}

      <Box flexDirection="column">
        <Text color={theme.gray}>{"─".repeat(Math.min(columns - 2, 80))}</Text>
      </Box>

      <Box paddingY={1}>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          placeholder="输入消息..."
          isFocused={isFocused}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </Box>

      <StatusBar
        model="qwen2.5-vl-3b"
        tokens={appState.tokenCount}
        connected={appState.connected}
        showShortcuts
      />

      {modal.isOpen && modal.type === "commandPalette" && (
        <Box position="absolute" top={3} left={1} right={1}>
          <CommandPalette
            commands={commandsWithActions}
            onClose={closeModal}
            placeholder="输入命令..."
          />
        </Box>
      )}

      {modal.isOpen && modal.type === "dialog" && (
        <Box position="absolute" top={Math.floor(rows / 2 - 5)} left={Math.floor((columns - 60) / 2)}>
          <Dialog
            title={(modal.props?.title as string) ?? "Dialog"}
            onClose={closeModal}
            actions={(modal.props?.actions as any[]) ?? []}
          >
            <Text>{(modal.props?.content as string) ?? "Dialog content"}</Text>
          </Dialog>
        </Box>
      )}

      {showHelp && (
        <Box position="absolute" top={Math.floor(rows / 2 - 8)} left={Math.floor((columns - 50) / 2)}>
          <HelpPanel keybindings={keybindings} onClose={() => setShowHelp(false)} />
        </Box>
      )}

      <NotificationPanel
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </Box>
  )
}
