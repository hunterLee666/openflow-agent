import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
  const { state: uiState, togglePalette, toggleSidebar, setHelp, setLoading, setStreaming, state } = useUIContext();
  const { createSession, addMessage, getActiveSession, clearMessages } = useSessionContext();
  const [input, setInput] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('assistant');
  const [showSettings, setShowSettings] = useState(false);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const bridge = useBridge('ws://localhost:8765');

  useEffect(() => {
    bridge.connect().catch(console.error);
    return () => {
      bridge.disconnect().catch(console.error);
    };
  }, []);

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
    }
  }, [createSession, getActiveSession, clearMessages, setHelp, toggleSidebar]);

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
    const sessionId = activeSession?.id || createSession().id;

    addMessage(sessionId, {
      role: 'user',
      content: input,
    });

    setInput('');
    setLoading(true);
    setStreaming(true);

    try {
      const request: QueryRequest = {
        message: input,
        threadId: sessionId,
      };

      const response = await bridge.streamQuery(request);

      addMessage(sessionId, {
        role: 'assistant',
        content: response.content || 'No response',
      });
    } catch (error) {
      addMessage(sessionId, {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }, [input, bridge, getActiveSession, createSession, addMessage, setLoading, setStreaming]);

  const settingsSections: SettingsSection[] = useMemo(() => [
    {
      title: 'Appearance',
      items: [
        {
          id: 'theme',
          label: 'Theme',
          type: 'select',
          value: state.currentTheme,
          options: [
            { value: 'default', label: 'Default' },
            { value: 'one-dark', label: 'One Dark' },
            { value: 'monokai', label: 'Monokai' },
            { value: 'dracula', label: 'Dracula' },
          ],
          onChange: (value) => console.log('Theme changed to:', value),
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
  ], [state.currentTheme, selectedAgent]);

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
