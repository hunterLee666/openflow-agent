import React, {
  type ReactNode,
  type ReactElement,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { Box } from "./components/Box.js";
import { Text } from "./components/Text.js";
import { Spinner } from "./components/Spinner.js";
import { MessageComponent, MessageList, type Message } from "./components/Message.js";
import { TextInput } from "./components/TextInput.js";
import { Markdown } from "./components/Markdown.js";
import { StatusBar } from "./components/StatusBar.js";
import { Notifications } from "./components/Notifications.js";
import { Help } from "./components/Help.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { useInput } from "./hooks/useInput.js";
import { SHOW_CURSOR, HIDE_CURSOR } from "./ansi.js";
import { useHistory } from "./hooks/useHistory.js";
import { useDoublePress } from "./hooks/useDoublePress.js";
import type { KeybindingContextName } from "./keybindings/schema.js";
import {
  VimStateMachine,
  createVimStateMachine,
  type VimMode,
  type VimState,
  type VimConfig,
  DEFAULT_VIM_CONFIG,
  formatModeIndicator,
} from "./vim/index.js";
import {
  detectTerminalFromEnv,
  getMouseProtocolSequence,
  type TerminalInfo,
} from "./termio/index.js";
import { z } from "zod";

export const AppNotificationSchema = z.object({
  id: z.string(),
  type: z.enum(['info', 'warning', 'error']),
  message: z.string(),
})
export type AppNotification = z.infer<typeof AppNotificationSchema>

export const AppPropsSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  messages: z.array(z.any()).optional(),
  onSendMessage: z.function().args(z.string()).returns(z.void()).optional(),
  onExit: z.function().returns(z.void()).optional(),
  children: z.any().optional(),
  isLoading: z.boolean().optional(),
  error: z.string().nullable().optional(),
  showHelp: z.boolean().optional(),
  showNotifications: z.boolean().optional(),
  showStatusBar: z.boolean().optional(),
  prompt: z.string().optional(),
  enableVimMode: z.boolean().optional(),
  vimConfig: z.record(z.string(), z.any()).optional(),
})
export type AppProps = z.infer<typeof AppPropsSchema>

export const AppStateSchema = z.object({
  input: z.string(),
  messages: z.array(z.any()),
  isLoading: z.boolean(),
  selectedIndex: z.number(),
  showHelp: z.boolean(),
  notifications: z.array(AppNotificationSchema),
  vimMode: z.enum(['normal', 'insert', 'visual', 'visual-line', 'command']),
  vimState: z.any().nullable(),
  terminalInfo: z.any().nullable(),
})
export type AppState = z.infer<typeof AppStateSchema>

export function App({
  title = "OpenFlow CLI",
  subtitle,
  messages = [],
  onSendMessage,
  onExit,
  children,
  isLoading: externalIsLoading = false,
  error,
  showHelp: initialShowHelp = false,
  showNotifications: initialShowNotifications = true,
  showStatusBar: initialShowStatusBar = true,
  prompt = ">",
  enableVimMode = false,
  vimConfig = {},
}: AppProps): ReactElement {
  const [input, setInput] = useState("");
  const [internalMessages, setInternalMessages] = useState<Message[]>(messages);
  const [internalIsLoading, setInternalIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showHelp, setShowHelp] = useState(initialShowHelp);
  const [notifications, setNotifications] = useState<AppState['notifications']>([]);
  const [vimMode, setVimMode] = useState<VimMode>(enableVimMode ? 'normal' : 'insert');
  const [vimState, setVimState] = useState<VimState | null>(null);
  const [terminalInfo, setTerminalInfo] = useState<TerminalInfo | null>(null);
  const terminalSize = useTerminalSize();
  const inputHistory = useHistory<string>({ maxSize: 100 });
  const vimMachineRef = useRef<VimStateMachine | null>(null);

  const isLoading = externalIsLoading || internalIsLoading;

  useEffect(() => {
    const info = detectTerminalFromEnv()
    setTerminalInfo(info)

    if (info.supportsMouse) {
      const { enable } = getMouseProtocolSequence(info.program)
      process.stdout.write(enable)
    }

    if (enableVimMode) {
      vimMachineRef.current = createVimStateMachine({
        ...DEFAULT_VIM_CONFIG,
        ...vimConfig,
        enableVimMode: true,
      })
      setVimState(vimMachineRef.current.getState())
    }
  }, [])

  useEffect(() => {
    process.stdout.write(HIDE_CURSOR);
    return () => {
      process.stdout.write(SHOW_CURSOR);

      if (terminalInfo?.supportsMouse) {
        process.stdout.write('\x1b[?9l\x1b[?1000l\x1b[?1001l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1016l')
      }
    };
  }, [terminalInfo]);

  const addNotification = useCallback(
    (type: 'info' | 'warning' | 'error', message: string) => {
      const id = `notification-${Date.now()}`
      setNotifications(prev => [...prev, { id, type, message }])
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }, 5000)
    },
    []
  )

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const handleExitDoublePress = useDoublePress(
    () => {
      addNotification('info', 'Ctrl+C again to exit')
    },
    () => {
      onExit?.()
    }
  )

  const handleHistoryUp = useCallback(() => {
    const item = inputHistory.goBack()
    if (item !== null) {
      setInput(item)
    }
  }, [inputHistory])

  const handleHistoryDown = useCallback(() => {
    const item = inputHistory.goForward()
    if (item !== null) {
      setInput(item)
    } else {
      setInput('')
    }
  }, [inputHistory])

  useInput({
    onEscape: () => {
      if (enableVimMode && vimMachineRef.current) {
        const result = vimMachineRef.current.handleKey('<Esc>')
        setVimMode(result.newState.mode)
        setVimState(result.newState)
      } else if (showHelp) {
        setShowHelp(false)
      } else if (input) {
        setInput('')
      } else {
        onExit?.()
      }
    },
    onCtrlC: () => {
      if (enableVimMode && vimMachineRef.current && vimMode !== 'insert') {
        const result = vimMachineRef.current.handleKey('<Ctrl-c>')
        setVimMode(result.newState.mode)
        setVimState(result.newState)
      } else {
        handleExitDoublePress()
      }
    },
    onCtrlL: () => {
      setInternalMessages([])
      addNotification('info', 'Screen cleared')
    },
    onCtrlR: () => {
      addNotification('info', 'History search not implemented')
    },
    onArrowUp: () => {
      if (enableVimMode && vimMachineRef.current && vimMode === 'normal') {
        const result = vimMachineRef.current.handleKey('k')
        setVimMode(result.newState.mode)
        setVimState(result.newState)
      } else if (!input) {
        handleHistoryUp()
      }
    },
    onArrowDown: () => {
      if (enableVimMode && vimMachineRef.current && vimMode === 'normal') {
        const result = vimMachineRef.current.handleKey('j')
        setVimMode(result.newState.mode)
        setVimState(result.newState)
      } else if (!input) {
        handleHistoryDown()
      }
    },
    onTab: () => {
      // Auto-complete logic can be added here
    },
    onEnter: () => {
      if (enableVimMode && vimMachineRef.current && vimMode === 'command') {
        const result = vimMachineRef.current.handleKey('<Enter>')
        setVimMode(result.newState.mode)
        setVimState(result.newState)
      } else if (input.trim()) {
        handleSend(input);
      }
    },
    onKeyDown: (event) => {
      if (enableVimMode && vimMachineRef.current) {
        const result = vimMachineRef.current.handleKey(event.key)
        setVimMode(result.newState.mode)
        setVimState(result.newState)

        const action = result.action
        if (action) {
          if (action.type === 'insert_text') {
            const payload = action.payload
            if (payload && payload.text) {
              setInput(prev => prev + payload.text)
            }
          } else if (action.type === 'delete_char') {
            setInput(prev => prev.slice(0, -1))
          } else if (action.type === 'delete_line') {
            setInput('')
          } else if (action.type === 'submit') {
            if (input.trim()) {
              handleSend(input)
            }
          }
        }
      }
    },
  });

  const handleSend = useCallback(
    (text: string) => {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      };

      setInternalMessages(prev => [...prev, userMessage]);
      inputHistory.push(text)
      setInput("");

      onSendMessage?.(text);
    },
    [input, onSendMessage, inputHistory]
  );

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      handleSend(value);
    },
    [handleSend]
  );

  return (
    <Box
      flexDirection="column"
      width="100%"
      height={terminalSize.height}
      style={{ fontFamily: "monospace" }}
    >
      <Box
        flexDirection="column"
        padding={1}
        backgroundColor="#1a1a2e"
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="column">
            <Text bold color="brightWhite">
              {title}
            </Text>
            {subtitle && (
              <Text color="dim" style={{ fontSize: 12 }}>
                {subtitle}
              </Text>
            )}
          </Box>
          {isLoading && <Spinner label="thinking..." />}
        </Box>
      </Box>

      <Box flexDirection="column" flex={1} overflow="auto" padding={1}>
        {internalMessages.length > 0 ? (
          <MessageList messages={internalMessages} />
        ) : (
          <Box flexDirection="column" alignItems="center" justifyContent="center" flex={1}>
            <Text color="dim">Welcome to {title}</Text>
            <Text color="dim" style={{ fontSize: 12, marginTop: 8 }}>
              Type your message and press Enter to start
            </Text>
          </Box>
        )}

        {children}

        {error && (
          <Box padding={1} backgroundColor="#3a1a1a">
            <Text color="red" bold>
              Error: {error}
            </Text>
          </Box>
        )}
      </Box>

      {initialShowNotifications && notifications.length > 0 && (
        <Notifications
          notifications={notifications.map(n => ({
            id: n.id,
            type: n.type,
            message: n.message,
          }))}
          onDismiss={removeNotification}
        />
      )}

      {showHelp && <Help isOpen={showHelp} onClose={() => setShowHelp(false)} />}

      <Box
        flexDirection="row"
        alignItems="center"
        padding={1}
        backgroundColor="#1a1a2e"
        gap={1}
      >
        {enableVimMode && vimState && (
          <Text
            color={vimMode === 'normal' ? 'green' : vimMode === 'insert' ? 'cyan' : vimMode === 'visual' ? 'yellow' : 'magenta'}
            bold
          >
            {formatModeIndicator(vimMode)}
          </Text>
        )}
        <Text color="cyan" bold>
          {prompt}
        </Text>

        <Box flex={1}>
          <TextInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            placeholder={enableVimMode && vimMode === 'normal' ? 'Normal mode - press i to insert' : 'Type a message...'}
            autoFocus={vimMode === 'insert' || !enableVimMode}
          />
        </Box>

        {isLoading && <Spinner label="thinking..." />}
      </Box>

      {initialShowStatusBar && (
        <StatusBar
          segments={[
            { label: 'mode', value: enableVimMode ? vimMode : 'chat' },
            { label: 'connection', value: 'connected' },
            { label: 'tokens', value: '0' },
            ...(terminalInfo ? [{ label: 'terminal', value: terminalInfo.name }] : []),
          ]}
        />
      )}
    </Box>
  );
}

export interface TabbedAppProps extends AppProps {
  tabs?: Array<{ id: string; label: string; content: ReactNode }>
  activeTab?: string
  onTabChange?: (tabId: string) => void
}

export function TabbedApp({
  tabs = [],
  activeTab,
  onTabChange,
  ...props
}: TabbedAppProps): ReactElement {
  const [internalActiveTab, setInternalActiveTab] = useState(activeTab || tabs[0]?.id)
  const currentTab = tabs.find(t => t.id === internalActiveTab) || tabs[0]

  const handleTabChange = useCallback((tabId: string) => {
    setInternalActiveTab(tabId)
    onTabChange?.(tabId)
  }, [onTabChange])

  return (
    <App {...props}>
      <Box flexDirection="column" flex={1}>
        <Box flexDirection="row" gap={1} padding={1}>
          {tabs.map(tab => (
            <Box
              key={tab.id}
              padding={1}
              onClick={() => handleTabChange(tab.id)}
              style={{
                borderBottom: tab.id === internalActiveTab ? '2px solid #4a9eff' : 'none',
                cursor: 'pointer',
              }}
            >
              <Text
                color={tab.id === internalActiveTab ? 'brightWhite' : 'dim'}
                bold={tab.id === internalActiveTab}
              >
                {tab.label}
              </Text>
            </Box>
          ))}
        </Box>
        {currentTab?.content}
      </Box>
    </App>
  )
}

export function renderApp(props: AppProps): ReactElement {
  return <App {...props} />;
}

export default App;
