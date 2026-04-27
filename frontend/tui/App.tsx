import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { ThemeProvider, useTheme } from './components/theme-provider';
import { CommandPalette, type Command } from './components/command-palette';
import { HelpScreen } from './components/help-screen';
import { Spinner } from './components/spinner';
import { TextInput } from './components/text-input';
import { WelcomeScreen } from './components/welcome-screen';

const COMMANDS: Command[] = [
  { id: 'help', label: 'Help', shortcut: '?', group: 'General', onSelect: () => {} },
  { id: 'quit', label: 'Quit', shortcut: 'Ctrl+C', group: 'General', onSelect: () => process.exit(0) },
  { id: 'clear', label: 'Clear', shortcut: 'Ctrl+L', group: 'General', onSelect: () => {} },
  { id: 'settings', label: 'Settings', shortcut: 'Ctrl+,', group: 'General', onSelect: () => {} },
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const AppContent: React.FC = () => {
  const theme = useTheme();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCommand = (cmd: Command) => {
    if (cmd.id === 'help') {
      setIsHelpOpen(true);
    } else if (cmd.id === 'quit') {
      process.exit(0);
    } else if (cmd.id === 'clear') {
      setMessages([]);
    }
    setIsPaletteOpen(false);
  };

  useInput((input, key) => {
    if (key.ctrl && key.k) {
      setIsPaletteOpen(true);
    }
  });

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'This is a response from OpenFlow CLI using termcn components!',
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  if (isHelpOpen) {
    return <HelpScreen />;
  }

  return (
    <ThemeProvider>
      <Box flexDirection="column" height={100} padding={1}>
        <Box borderStyle="round" borderColor={theme.colors.focusRing} padding={1} flexDirection="column">
          <Text bold color={theme.colors.primary}>OpenFlow CLI v0.1.0</Text>
          <Text dimColor>Ctrl+K: Commands | Ctrl+H: Help</Text>
        </Box>

        <Box flexDirection="column" marginTop={1} flexGrow={1}>
          {messages.length === 0 ? (
            <WelcomeScreen appName="OpenFlow CLI" />
          ) : (
            <Box>
              {messages.map((msg) => (
                <Text key={msg.id} color={msg.role === 'user' ? 'cyan' : 'green'}>
                  {msg.role === 'user' ? '> ' : '< '}{msg.content}
                </Text>
              ))}
            </Box>
          )}
        </Box>

        <Box marginTop={1}>
          <Box flexGrow={1}>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder="Type your message..."
            />
          </Box>
          {isLoading && <Spinner />}
        </Box>

        <CommandPalette
          commands={COMMANDS.map(cmd => ({
            ...cmd,
            onSelect: () => handleCommand(cmd),
          }))}
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
        />
      </Box>
    </ThemeProvider>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};
