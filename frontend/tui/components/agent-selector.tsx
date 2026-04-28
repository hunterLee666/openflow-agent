import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from './theme-provider';
import { useInput } from '../hooks/use-input';
import { Divider } from './divider';

export interface AgentOption {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

export interface AgentSelectorProps {
  agents: AgentOption[];
  selected: string;
  onSelect?: (id: string) => void;
  width?: number;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
  agents,
  selected,
  onSelect,
  width = 50,
}) => {
  const theme = useTheme();
  const [focusIndex, setFocusIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const selectedAgent = agents.find((a) => a.id === selected);

  const handleSelect = (id: string) => {
    onSelect?.(id);
    setIsOpen(false);
  };

  useInput((_input, key) => {
    if (key.upArrow) {
      setFocusIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setFocusIndex((prev) => Math.min(agents.length - 1, prev + 1));
    } else if (key.return) {
      const agent = agents[focusIndex];
      if (agent) {
        handleSelect(agent.id);
      }
    } else if (key.escape) {
      setIsOpen(false);
    }
  });

  if (!isOpen) {
    return (
      <Box
        flexDirection="column"
        width={width}
        borderStyle="single"
        borderColor={theme.colors.border}
      >
        <Box paddingX={1} paddingY={1}>
          <Text dimColor>Agent: </Text>
          <Text bold color="cyan">
            {selectedAgent?.name || 'None'}
          </Text>
          <Text dimColor> (Enter to select)</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="single"
      borderColor={theme.colors.focusRing}
    >
      <Box paddingX={1} paddingY={1} borderStyle="single" borderColor={theme.colors.border}>
        <Text bold color="cyan">
          Select Agent
        </Text>
        <Text dimColor> (Esc to close)</Text>
      </Box>
      <Divider />
      {agents.map((agent, index) => {
        const isActive = index === focusIndex;
        const isSelected = agent.id === selected;

        return (
          <Box
            key={agent.id}
            flexDirection="column"
            paddingX={1}
            paddingY={1}
            borderStyle="single"
            borderColor={isActive ? theme.colors.focusRing : 'transparent'}
          >
            <Text bold={isSelected} color={isSelected ? theme.colors.primary : undefined}>
              {agent.icon || '●'} {agent.name}
            </Text>
            {agent.description && (
              <Text dimColor>
                {agent.description}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
