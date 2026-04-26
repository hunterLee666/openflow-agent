import React, { type ReactElement } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { z } from "zod";

export const KeyboardShortcutSchema = z.object({
  key: z.string(),
  modifiers: z.array(z.enum(["ctrl", "alt", "shift", "meta"])).readonly().optional(),
  description: z.string().optional(),
})
export type KeyboardShortcut = z.infer<typeof KeyboardShortcutSchema>

export const KeyboardShortcutHintPropsSchema = z.object({
  shortcut: z.union([KeyboardShortcutSchema, z.array(KeyboardShortcutSchema)]),
  description: z.string().optional(),
  variant: z.enum(["inline", "block"]).optional(),
})
export type KeyboardShortcutHintProps = z.infer<typeof KeyboardShortcutHintPropsSchema>

function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  if (shortcut.modifiers) {
    for (const mod of shortcut.modifiers) {
      switch (mod) {
        case "ctrl":
          parts.push("Ctrl");
          break;
        case "alt":
          parts.push("Alt");
          break;
        case "shift":
          parts.push("Shift");
          break;
        case "meta":
          parts.push("⌘");
          break;
      }
    }
  }

  parts.push(shortcut.key.toUpperCase());

  return parts.join("+");
}

function KeyBadge({
  shortcut,
  isHighlighted = false,
}: {
  shortcut: KeyboardShortcut;
  isHighlighted?: boolean;
}): React.ReactElement {
  return (
    <Box
      flexDirection="row"
      alignItems="center"
      padding={{ top: 0, bottom: 0, left: 1, right: 1 }}
      style={{
        backgroundColor: isHighlighted ? "#3a5a8e" : "#2a2a3e",
        border: "1px solid #444",
        borderRadius: 3,
      }}
    >
      {shortcut.modifiers?.includes("ctrl") && (
        <Text color="dim" style={{ fontSize: 10 }}>
          Ctrl+
        </Text>
      )}
      {shortcut.modifiers?.includes("alt") && (
        <Text color="dim" style={{ fontSize: 10 }}>
          Alt+
        </Text>
      )}
      {shortcut.modifiers?.includes("shift") && (
        <Text color="dim" style={{ fontSize: 10 }}>
          Shift+
        </Text>
      )}
      {shortcut.modifiers?.includes("meta") && (
        <Text color="dim" style={{ fontSize: 10 }}>
          ⌘+
        </Text>
      )}
      <Text color={isHighlighted ? "brightWhite" : "white"} style={{ fontSize: 11 }}>
        {shortcut.key.toUpperCase()}
      </Text>
    </Box>
  );
}

export function KeyboardShortcutHint({
  shortcut,
  description,
  variant = "inline",
}: KeyboardShortcutHintProps): ReactElement {
  const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut];

  if (variant === "block") {
    return (
      <Box
        flexDirection="column"
        gap={1}
        padding={1}
        style={{ backgroundColor: "#1a1a2e", border: "1px solid #333", borderRadius: 4 }}
      >
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {shortcuts.map((s, idx) => (
            <KeyBadge key={idx} shortcut={s} />
          ))}
        </Box>
        {description && (
          <Text color="dim" style={{ fontSize: 11 }}>
            {description}
          </Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      <Box flexDirection="row" gap={1}>
        {shortcuts.map((s, idx) => (
          <KeyBadge key={idx} shortcut={s} />
        ))}
      </Box>
      {description && (
        <Text color="dim" style={{ fontSize: 10 }}>
          {description}
        </Text>
      )}
    </Box>
  );
}

export interface ShortcutListProps {
  shortcuts: Array<{
    shortcut: KeyboardShortcut | KeyboardShortcut[];
    description: string;
  }>;
  title?: string;
}

export function ShortcutList({
  shortcuts,
  title,
}: ShortcutListProps): ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      {title && (
        <Box padding={{ bottom: 1 }}>
          <Text bold color="brightWhite">
            {title}
          </Text>
        </Box>
      )}

      {shortcuts.map((item, idx) => (
        <Box
          key={idx}
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          padding={{ top: 0, bottom: 0 }}
        >
          <Text color="white" style={{ fontSize: 11 }}>
            {item.description}
          </Text>
          <KeyboardShortcutHint shortcut={item.shortcut} variant="inline" />
        </Box>
      ))}
    </Box>
  );
}

export const COMMON_SHORTCUTS = {
  enter: { key: "Enter", description: "Send message" },
  escape: { key: "Escape", description: "Cancel / Exit" },
  ctrlC: { key: "C", modifiers: ["ctrl"], description: "Copy / Cancel" },
  ctrlV: { key: "V", modifiers: ["ctrl"], description: "Paste" },
  ctrlZ: { key: "Z", modifiers: ["ctrl"], description: "Undo" },
  arrowUp: { key: "↑", description: "Navigate up" },
  arrowDown: { key: "↓", description: "Navigate down" },
  arrowLeft: { key: "←", description: "Navigate left" },
  arrowRight: { key: "→", description: "Navigate right" },
  tab: { key: "Tab", description: "Next option" },
  shiftTab: { key: "Tab", modifiers: ["shift"], description: "Previous option" },
  space: { key: "Space", description: "Select / Toggle" },
  pageUp: { key: "PageUp", description: "Page up" },
  pageDown: { key: "PageDown", description: "Page down" },
  home: { key: "Home", description: "Go to start" },
  end: { key: "End", description: "Go to end" },
} as const;

export default KeyboardShortcutHint;
