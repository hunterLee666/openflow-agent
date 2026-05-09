import React from 'react';
import { Text, Box, useInput } from 'ink';
import { AgentService } from '@engine/agentService';
import { getGlobalConfig } from '@utils/config';
import { getCwd } from '@utils/state';
import { ASCII_LOGO } from '@constants/product';

interface REPLProps {
  commands?: any;
  debug?: boolean;
  disableSlashCommands?: boolean;
  initialPrompt?: string;
  messageLogName?: string;
  shouldShowPromptInput?: boolean;
  verbose?: boolean;
  tools?: any;
  safeMode?: boolean;
  mcpClients?: any;
  isDefaultModel?: boolean;
  initialUpdateVersion?: string | null;
  initialUpdateCommands?: string[] | null;
  initialMessages?: any;
}

export function REPL(props: REPLProps): React.ReactNode {
  const [output, setOutput] = React.useState<string>('');
  const [input, setInput] = React.useState(props.initialPrompt || '');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    try {
      const config = getGlobalConfig();
      const agent = new AgentService({ cwd: getCwd(), model: config.model });
      const result = await agent.query(input);
      setOutput(String(result));
    } catch (err) {
      setOutput(String(err));
    } finally {
      setLoading(false);
    }
  };

  // Simplified UI using Ink
  return (
    <Box flexDirection="column">
      <Text>{ASCII_LOGO}</Text>
      <Text bold>OpenFlow REPL</Text>
      {output && (
        <Box borderStyle="round" paddingX={1} paddingY={0} marginBottom={1}>
          <Text>{output}</Text>
        </Box>
      )}
      <Text>
        {loading ? 'Thinking...' : '>'} <Text color={loading ? 'gray' : undefined}>{input}</Text>
      </Text>
    </Box>
  );
}
