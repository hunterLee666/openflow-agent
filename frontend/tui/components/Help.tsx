import React, { type ReactElement, type ReactNode } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { Tabs } from "./Tabs.js";
import { Dialog } from "./Dialog.js";
import { KeyboardShortcutHint, COMMON_SHORTCUTS } from "./KeyboardShortcutHint.js";
import { z } from "zod";

export const CommandHelpSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  shortcut: z.string().optional(),
})
export type CommandHelp = z.infer<typeof CommandHelpSchema>

export const HelpPropsSchema = z.object({
  isOpen: z.boolean(),
  onClose: z.function().returns(z.void()),
  commands: z.array(CommandHelpSchema).optional(),
  customCommands: z.array(CommandHelpSchema).optional(),
})
export type HelpProps = z.infer<typeof HelpPropsSchema>

function GeneralHelp(): ReactElement {
  return (
    <Box flexDirection="column" gap={1} padding={1}>
      <Text bold color="brightWhite">
        Quick Start
      </Text>
      <Box flexDirection="column" gap="0" paddingLeft={2}>
        <Text>
          <Text color="cyan">/help</Text> - Show this help menu
        </Text>
        <Text>
          <Text color="cyan">/clear</Text> - Clear conversation history
        </Text>
        <Text>
          <Text color="cyan">/clone &lt;repo&gt;</Text> - Clone a repository
        </Text>
        <Text>
          <Text color="cyan">/commit</Text> - Create a commit
        </Text>
        <Text>
          <Text color="cyan">/diff</Text> - View changes
        </Text>
        <Text>
          <Text color="cyan">/exit</Text> - Exit the application
        </Text>
      </Box>

      <Box marginTop={2}>
        <Text bold color="brightWhite">
          Keyboard Shortcuts
        </Text>
      </Box>
      <Box flexDirection="column" gap="0" paddingLeft={2}>
        <Box flexDirection="row" alignItems="center" gap={2}>
          <KeyboardShortcutHint shortcut={COMMON_SHORTCUTS.enter} />
          <Text>Send message</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={2}>
          <KeyboardShortcutHint shortcut={COMMON_SHORTCUTS.escape} />
          <Text>Cancel / Exit</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={2}>
          <KeyboardShortcutHint shortcut={COMMON_SHORTCUTS.ctrlC} />
          <Text>Copy / Cancel</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={2}>
          <KeyboardShortcutHint shortcut={COMMON_SHORTCUTS.arrowUp} />
          <Text>Navigate up</Text>
        </Box>
        <Box flexDirection="row" alignItems="center" gap={2}>
          <KeyboardShortcutHint shortcut={COMMON_SHORTCUTS.arrowDown} />
          <Text>Navigate down</Text>
        </Box>
      </Box>

      <Box marginTop={2}>
        <Text dimColor={true}>
          For more help, visit: https://docs.openflow.ai
        </Text>
      </Box>
    </Box>
  );
}

function CommandList({
  commands,
  title,
  emptyMessage = "No commands found",
}: {
  commands?: CommandHelp[];
  title: string;
  emptyMessage?: string;
}): ReactElement {
  if (!commands || commands.length === 0) {
    return (
      <Box padding={1}>
        <Text dimColor={true}>{emptyMessage}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap="0" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="brightWhite">
          {title}
        </Text>
      </Box>
      {commands.map((cmd, index) => (
        <Box
          key={cmd.name || index}
          flexDirection="row"
          gap={2}
          paddingTop="0"
          paddingBottom="0"
        >
          <Text color="cyan" width={20}>
            {cmd.name}
          </Text>
          {cmd.description && (
            <Text dimColor={true} style={{ flex: 1 }}>
              {cmd.description}
            </Text>
          )}
          {cmd.shortcut && (
            <Text color="yellow">{cmd.shortcut}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}

const DEFAULT_COMMANDS: CommandHelp[] = [
  { name: "/help", description: "Show this help menu" },
  { name: "/clear", description: "Clear conversation history" },
  { name: "/clone", description: "Clone a repository", shortcut: "Ctrl+G" },
  { name: "/commit", description: "Create a commit" },
  { name: "/diff", description: "View changes", shortcut: "Ctrl+D" },
  { name: "/exit", description: "Exit the application", shortcut: "Ctrl+C" },
  { name: "/model", description: "Switch AI model" },
  { name: "/cost", description: "Show cost statistics" },
  { name: "/compact", description: "Compact context window" },
  { name: "/resume", description: "Resume a task" },
  { name: "/undo", description: "Undo last action" },
];

export function Help({
  isOpen,
  onClose,
  commands = DEFAULT_COMMANDS,
  customCommands = [],
}: HelpProps): ReactElement | null {
  const tabs = [
    {
      id: "general",
      label: "General",
      content: <GeneralHelp />,
    },
    {
      id: "commands",
      label: "Commands",
      content: <CommandList commands={commands} title="Built-in Commands:" />,
    },
    {
      id: "custom",
      label: "Custom",
      content: (
        <CommandList
          commands={customCommands}
          title="Custom Commands:"
          emptyMessage="No custom commands found"
        />
      ),
    },
  ];

  return (
    <Dialog isOpen={isOpen} title="Help" width={70} onClose={onClose}>
      <Tabs tabs={tabs} variant="line" />
    </Dialog>
  );
}

export default Help;
