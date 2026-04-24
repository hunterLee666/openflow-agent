import React, { type ReactNode, useState, useCallback } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { useInput } from "../hooks/useInput.js";
import type { SlashCommand } from "../../commands/types.js";

export interface SlashCommandsProps {
  commands: SlashCommand[];
  onSelect: (command: SlashCommand, args: string) => void;
  onCancel: () => void;
  maxHeight?: number;
}

export function SlashCommands({
  commands,
  onSelect,
  onCancel,
  maxHeight = 10,
}: SlashCommandsProps): ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState("");

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.name.includes(filter) ||
      cmd.aliases.some((a) => a.includes(filter))
  );

  useInput({
    onArrowUp: () => {
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredCommands.length - 1
      );
    },
    onArrowDown: () => {
      setSelectedIndex((prev) =>
        prev < filteredCommands.length - 1 ? prev + 1 : 0
      );
    },
    onEnter: () => {
      if (filteredCommands[selectedIndex]) {
        onSelect(filteredCommands[selectedIndex], "");
      }
    },
    onEscape: () => {
      onCancel();
    },
  });

  if (filteredCommands.length === 0) {
    return (
      <Box
        flexDirection="column"
        padding={1}
        style={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 4 }}
      >
        <Text color="dim">No commands found</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      maxHeight={maxHeight}
      overflow="auto"
      padding={1}
      style={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 4 }}
    >
      {filteredCommands.map((cmd, index) => (
        <Box
          key={cmd.name}
          flexDirection="row"
          padding={{ top: 0, bottom: 0, left: 1, right: 1 }}
          style={{
            backgroundColor: index === selectedIndex ? "#2a2a4e" : "transparent",
          }}
        >
          <Box flex={1} flexDirection="row" gap={2}>
            <Text bold color={index === selectedIndex ? "brightWhite" : "cyan"}>
              /{cmd.name}
            </Text>
            {cmd.aliases.length > 0 && (
              <Text color="dim" style={{ fontSize: 10 }}>
                ({cmd.aliases.map((a) => `/${a}`).join(", ")})
              </Text>
            )}
          </Box>
          <Text color="dim" style={{ fontSize: 10 }}>
            {cmd.description}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export function parseSlashCommand(input: string): {
  command: string;
  args: string;
} | null {
  if (!input.startsWith("/")) {
    return null;
  }

  const parts = input.slice(1).split(/\s+/);
  const command = parts[0] || "";
  const args = parts.slice(1).join(" ") || "";

  return { command, args };
}

export function isSlashCommand(input: string): boolean {
  return input.startsWith("/");
}

export default SlashCommands;
