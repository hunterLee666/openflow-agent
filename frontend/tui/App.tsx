import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { useInput } from './hooks/use-input';
import { useBridge } from './hooks/use-bridge';
import { ThemeProvider } from './components/theme-provider';
import { CommandPalette, type Command } from './components/command-palette';
import { HelpScreen } from './components/help-screen';
import { MainContent } from './components/main-content';
import { Composer } from './components/Composer';
import { SessionSidebar } from './components/session-sidebar';
import { AgentSelector, type AgentOption } from './components/agent-selector';
import { SettingsPanel, type SettingsSection } from './components/settings-panel';
import { Divider } from './components/divider';
import { Spinner } from './components/spinner';
import { SessionProvider, useSessionContext } from './contexts/session-context';
import { UIProvider, useUIContext } from './contexts/ui-context';
import type { QueryRequest } from './api-types';

const AGENTS: AgentOption[] = [
  { id: 'assistant', name: 'Assistant', description: 'General purpose assistant' },
  { id: 'coder', name: 'Coder', description: 'Specialized in code generation and debugging' },
  { id: 'analyst', name: 'Analyst', description: 'Data analysis and research' },
];

const COMMANDS: Command[] = [
  { id: 'help', label: 'Help', shortcut: '?', group: 'General', onSelect: () => {} },
  { id: 'quit', label: 'Quit', shortcut: 'Ctrl+C', group: 'General', onSelect: () => process.exit(0) },
  { id: 'clear', label: 'Clear Chat', shortcut: 'Ctrl+L', group: 'General', onSelect: () => {} },
  { id: 'settings', label: 'Settings', shortcut: 'Ctrl+,', group: 'General', onSelect: () => {} },
  { id: 'newSession', label: 'New Session', shortcut: 'Ctrl+N', group: 'Session', onSelect: () => {} },
  { id: 'toggleSidebar', label: 'Toggle Sidebar', shortcut: 'Ctrl+B', group: 'View', onSelect: () => {} },
  { id: 'selectAgent', label: 'Select Agent', shortcut: 'Ctrl+A', group: 'Agent', onSelect: () => {} },
  { id: 'deleteSession', label: 'Delete Session', shortcut: 'Ctrl+D', group: 'Session', onSelect: () => {} },
  { id: 'exportSession', label: 'Export Session', shortcut: 'Ctrl+E', group: 'Session', onSelect: () => {} },
  { id: 'toggleTheme', label: 'Toggle Theme', shortcut: 'Ctrl+T', group: 'Appearance', onSelect: () => {} },
  { id: 'toggleSidebar2', label: 'Toggle Sidebar', shortcut: 'Ctrl+S', group: 'View', onSelect: () => {} },
  { id: 'showShortcuts', label: 'Show Shortcuts', shortcut: 'Ctrl+K', group: 'Help', onSelect: () => {} },
  { id: 'reconnect', label: 'Reconnect', shortcut: 'Ctrl+R', group: 'Connection', onSelect: () => {} },
  { id: 'clearHistory', label: 'Clear History', shortcut: 'Ctrl+H', group: 'Session', onSelect: () => {} },
  { id: 'copyLastResponse', label: 'Copy Last Response', shortcut: 'Ctrl+Shift+C', group: 'General', onSelect: () => {} },
];

const AppHeader: React.FC = () => {
  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      flexDirection="column"
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color="cyan">OpenFlow CLI</Text>
        <Text dimColor>v0.1.0</Text>
      </Box>
      <Text dimColor>Ctrl+K: Commands | Ctrl+H: Help | Ctrl+N: New Session</Text>
    </Box>
  );
};

interface CommandBarProps {
  isSidebarOpen: boolean;
  isLoading: boolean;
}

const CommandBar: React.FC<CommandBarProps> = ({ isSidebarOpen, isLoading }) => {
  return (
    <Box marginTop={1} flexDirection="row">
      <Box flexGrow={1}>
        <Text dimColor>
          {isSidebarOpen ? 'Sidebar: ON' : 'Sidebar: OFF'} | Ctrl+B: Toggle Sidebar
          {isLoading && ' | '}
          {isLoading && <Spinner />}
          {isLoading && ' Processing...'}
        </Text>
      </Box>
    </Box>
  );
};

const AppContent: React.FC = () => {
  const { state: uiState, togglePalette, toggleSidebar, setHelp, setLoading, setStreaming } = useUIContext();
  const { state: sessionState, createSession, deleteSession, addMessage, updateMessage, getActiveSession, clearMessages, setSessions, loadSessionMessages, addToolCall, updateToolCall } = useSessionContext();
  const [input, setInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('assistant');
  const [showSettings, setShowSettings] = useState(false);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [pendingQuery, setPendingQuery] = useState<{ message: string; sessionId: string; model: string; assistantMessageIndex: number } | null>(null);
  const bridge = useBridge('ws://localhost:8765');
  const streamingStateRef = useRef<{ sessionId: string; messageIndex: number } | null>(null);
  const bridgeRef = useRef(bridge);
  const hasLoadedSessions = useRef(false);

  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);

  useEffect(() => {
    let cancelled = false;
    if (cancelled) return;

    bridge.connect().catch((e) => {
      if (!cancelled) console.error('Bridge connect error:', e);
    });

    return () => {
      cancelled = true;
      bridge.disconnect().catch(console.error);
    };
  }, []);

  useEffect(() => {
    if (hasLoadedSessions.current) return;
    if (!bridge.isConnected || sessionState.sessions.length > 0) return;

    hasLoadedSessions.current = true;
    bridge.listSessions().then(async (response) => {
      if (response.sessions && response.sessions.length > 0) {
        const sessionsWithMessages = await Promise.all(
          response.sessions.map(async (s: any) => {
            const msgResponse = await bridge.getSession(s.id);
            return {
              id: s.id,
              title: s.title || `Session ${s.id.slice(-4)}`,
              messages: msgResponse.messages || [],
              createdAt: s.startedAt || Date.now(),
              updatedAt: s.endedAt || Date.now(),
            };
          })
        );
        setSessions(sessionsWithMessages);
      }
    }).catch(console.error);
  }, [bridge.isConnected, sessionState.sessions.length, bridge, setSessions]);

  useEffect(() => {
    const handleStreamChunk = (event: { chunk: string; contentLength: number; isFirst: boolean }, notificationSessionId?: string) => {
      if (streamingStateRef.current) {
        const { sessionId, messageIndex } = streamingStateRef.current;
        const session = sessionState.sessions.find((s: any) => s.id === sessionId);
        if (session && session.messages[messageIndex]) {
          const currentContent = session.messages[messageIndex].content || '';
          updateMessage(sessionId, messageIndex, { content: currentContent + event.chunk });
        }
      }
    };

    const handleToolCall = (event: { toolCall: { name: string; arguments?: Record<string, unknown> } }) => {
      if (streamingStateRef.current) {
        const { sessionId, messageIndex } = streamingStateRef.current;
        const toolId = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        addToolCall(sessionId, messageIndex, {
          id: toolId,
          name: event.toolCall.name,
          arguments: event.toolCall.arguments,
          status: 'running',
        });
      }
    };

    const handleToolResult = (event: { toolName: string; result: string }) => {
      if (streamingStateRef.current) {
        const { sessionId, messageIndex } = streamingStateRef.current;
        const session = sessionState.sessions.find((s: any) => s.id === sessionId);
        if (session && session.messages[messageIndex]?.toolCalls) {
          const toolCalls = session.messages[messageIndex].toolCalls;
          const lastTool = toolCalls[toolCalls.length - 1];
          if (lastTool && lastTool.name === event.toolName) {
            updateToolCall(sessionId, messageIndex, lastTool.id, {
              result: event.result,
              status: 'success',
            });
          }
        }
      }
    };

    bridge.onStreamChunk(handleStreamChunk);
    bridge.onToolCall(handleToolCall);
    bridge.onToolResult(handleToolResult);
  }, [bridge, sessionState.sessions, updateMessage, addToolCall, updateToolCall]);

  useEffect(() => {
    if (pendingQuery) {
      const { message, sessionId, model, assistantMessageIndex } = pendingQuery;
      setPendingQuery(null);

      streamingStateRef.current = { sessionId, messageIndex: assistantMessageIndex };

      bridge.streamQuery({ message, threadId: sessionId, model }).catch((error) => {
        if (streamingStateRef.current?.sessionId === sessionId) {
          updateMessage(sessionId, assistantMessageIndex, {
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
        streamingStateRef.current = null;
        setLoading(false);
        setStreaming(false);
      }).finally(() => {
        streamingStateRef.current = null;
        setLoading(false);
        setStreaming(false);
      });
    }
  }, [pendingQuery, bridge, updateMessage, setLoading, setStreaming]);

  const handleCommand = useCallback((cmd: Command) => {
    switch (cmd.id) {
      case 'help':
        setHelp(true);
        break;
      case 'quit':
        process.exit(0);
      case 'clear':
        const activeSession = getActiveSession();
        if (activeSession) {
          clearMessages(activeSession.id);
        }
        break;
      case 'newSession':
        createSession();
        break;
      case 'settings':
        setShowSettings(true);
        break;
      case 'toggleSidebar':
        toggleSidebar();
        break;
      case 'selectAgent':
        setShowAgentSelector(true);
        break;
      case 'deleteSession':
        const sessionToDelete = getActiveSession();
        if (sessionToDelete) {
          deleteSession(sessionToDelete.id);
        }
        break;
      case 'exportSession':
        console.log('Export session - not implemented');
        break;
      case 'toggleTheme':
        console.log('Toggle theme - not implemented');
        break;
      case 'reconnect':
        bridge.disconnect().then(() => bridge.connect());
        break;
      case 'clearHistory':
        console.log('Clear history - not implemented');
        break;
      case 'copyLastResponse':
        const lastSession = getActiveSession();
        if (lastSession && lastSession.messages.length > 0) {
          const lastMsg = lastSession.messages[lastSession.messages.length - 1];
          if (typeof lastMsg.content === 'string') {
            console.log(lastMsg.content);
          }
        }
        break;
    }
  }, [createSession, deleteSession, getActiveSession, clearMessages, setHelp, toggleSidebar, bridge]);

  useInput((input, key) => {
    if (key.ctrl && input === 'k') {
      togglePalette();
    } else if (key.ctrl && input === 'h') {
      setHelp(true);
    } else if (key.ctrl && input === 'n') {
      createSession();
    } else if (key.ctrl && input === 'b') {
      toggleSidebar();
    } else if (key.ctrl && input === ',') {
      setShowSettings(true);
    } else if (key.ctrl && input === 'a') {
      setInput('');
      setShowAgentSelector(true);
    }
  });

  const handleSubmit = useCallback(async () => {
    if (!input.trim()) return;
    if (!bridge.isConnected) {
      console.error('Not connected to server');
      return;
    }

    const activeSession = getActiveSession();
    const newSession = activeSession || createSession();
    const sessionId = newSession.id;

    const existingMessageCount = activeSession?.messages.length ?? 0;

    addMessage(sessionId, {
      role: 'user',
      content: input,
    });

    addMessage(sessionId, {
      role: 'assistant',
      content: '',
    });

    const assistantMessageIndex = existingMessageCount + 1;

    setPendingQuery({ message: input, sessionId, model: selectedAgent, assistantMessageIndex });

    setInput('');
    setLoading(true);
    setStreaming(true);
  }, [input, bridge, getActiveSession, createSession, addMessage, setPendingQuery, setLoading, setStreaming]);

  const settingsSections: SettingsSection[] = useMemo(() => [
    {
      title: 'Appearance',
      items: [
        {
          id: 'theme',
          label: 'Theme',
          type: 'select',
          value: uiState.currentTheme,
          options: [
            { value: 'default', label: 'Default' },
            { value: 'one-dark', label: 'One Dark' },
            { value: 'monokai', label: 'Monokai' },
            { value: 'dracula', label: 'Dracula' },
          ],
          onChange: (value) => console.log('Theme changed to:', value),
        },
        {
          id: 'fontSize',
          label: 'Font Size',
          type: 'select',
          value: '14',
          options: [
            { value: '12', label: 'Small (12px)' },
            { value: '14', label: 'Medium (14px)' },
            { value: '16', label: 'Large (16px)' },
            { value: '18', label: 'Extra Large (18px)' },
          ],
          onChange: (value) => console.log('Font size changed to:', value),
        },
        {
          id: 'showShortcuts',
          label: 'Show Shortcuts',
          type: 'toggle',
          value: true,
          onChange: (value) => console.log('Show shortcuts:', value),
        },
      ],
    },
    {
      title: 'Behavior',
      items: [
        {
          id: 'autoSave',
          label: 'Auto Save Sessions',
          type: 'toggle',
          value: true,
          onChange: (value) => console.log('Auto save:', value),
        },
        {
          id: 'streamResponse',
          label: 'Stream Responses',
          type: 'toggle',
          value: true,
          onChange: (value) => console.log('Stream responses:', value),
        },
        {
          id: 'soundEffects',
          label: 'Sound Effects',
          type: 'toggle',
          value: false,
          onChange: (value) => console.log('Sound effects:', value),
        },
      ],
    },
    {
      title: 'Agent',
      items: [
        {
          id: 'currentAgent',
          label: 'Current Agent',
          type: 'select',
          value: selectedAgent,
          options: AGENTS.map((a) => ({ value: a.id, label: a.name })),
          onChange: (value) => setSelectedAgent(value as string),
        },
      ],
    },
    {
      title: 'About',
      items: [
        {
          id: 'version',
          label: 'Version',
          type: 'input',
          value: '0.1.0',
        },
        {
          id: 'github',
          label: 'GitHub',
          type: 'input',
          value: 'github.com/hunterLee666/openflow-cli',
        },
      ],
    },
  ], [uiState.currentTheme, selectedAgent]);

  if (uiState.isHelpOpen) {
    return <HelpScreen title="Help" description="OpenFlow CLI Help">Use Ctrl+K for commands</HelpScreen>;
  }

  if (showSettings) {
    return (
      <SettingsPanel
        sections={settingsSections}
        onClose={() => setShowSettings(false)}
      />
    );
  }

  if (showAgentSelector) {
    return (
      <AgentSelector
        agents={AGENTS}
        selected={selectedAgent}
        onSelect={(id) => {
          setSelectedAgent(id);
          setShowAgentSelector(false);
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" height={100} padding={1}>
      <AppHeader />

      <Box flexGrow={1} marginTop={1} flexDirection="row">
        {uiState.isSidebarOpen && (
          <Box marginRight={1}>
            <SessionSidebar />
          </Box>
        )}

        <Box flexGrow={1}>
          <MainContent isStreaming={uiState.isStreaming} />
        </Box>
      </Box>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isLoading={uiState.isLoading}
        placeholder={`${AGENTS.find((a) => a.id === selectedAgent)?.name || 'Assistant'}: Type your message...`}
      />

      <Divider />

      <CommandBar
        isSidebarOpen={uiState.isSidebarOpen}
        isLoading={uiState.isLoading}
      />

      <CommandPalette
        commands={COMMANDS.map(cmd => ({
          ...cmd,
          onSelect: () => handleCommand(cmd),
        }))}
        isOpen={uiState.isPaletteOpen}
        onClose={() => togglePalette()}
      />
    </Box>
  );
};

const AppWithProviders: React.FC = () => {
  return (
    <ThemeProvider>
      <UIProvider>
        <SessionProvider>
          <AppContent />
        </SessionProvider>
      </UIProvider>
    </ThemeProvider>
  );
};

export const App: React.FC = () => {
  return <AppWithProviders />;
};
