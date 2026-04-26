import React, { type ReactElement } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { Dialog } from "./Dialog.js";
import { Button } from "./Button.js";
import { z } from "zod";

const GOODBYE_MESSAGES = [
  "Goodbye!",
  "See ya!",
  "Bye!",
  "Catch you later!",
  "Take care!",
];

function getRandomGoodbyeMessage(): string {
  return GOODBYE_MESSAGES[Math.floor(Math.random() * GOODBYE_MESSAGES.length)];
}

export const ExitFlowPropsSchema = z.object({
  isOpen: z.boolean(),
  onDone: z.function().args(z.string().optional()).returns(z.void()),
  onCancel: z.function().returns(z.void()).optional(),
  showWorktree: z.boolean().optional(),
})
export type ExitFlowProps = z.infer<typeof ExitFlowPropsSchema>

export function ExitFlow({
  isOpen,
  onDone,
  onCancel,
  showWorktree = false,
}: ExitFlowProps): ReactElement | null {
  if (!isOpen) {
    return null;
  }

  const handleExit = async () => {
    const message = getRandomGoodbyeMessage();
    onDone(message);
  };

  if (showWorktree) {
    return (
      <Dialog isOpen={isOpen} title="Worktree Exit" width={50} onClose={onCancel}>
        <Box flexDirection="column" gap={2} padding={1}>
          <Text>You have uncommitted changes in your worktree.</Text>
          <Text dimColor={true}>
            Please commit or stash your changes before exiting.
          </Text>
          <Box flexDirection="row" justifyContent="flex-end" gap={1} marginTop={2}>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleExit}>
              Exit Anyway
            </Button>
          </Box>
        </Box>
      </Dialog>
    );
  }

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      justifyContent="center"
      alignItems="center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}
    >
      <Box
        flexDirection="column"
        alignItems="center"
        gap={2}
        padding={4}
        style={{
          backgroundColor: "#1a1a2e",
          border: "1px solid #444",
          borderRadius: 4,
        }}
      >
        <Text bold color="brightWhite" style={{ fontSize: 18 }}>
          {getRandomGoodbyeMessage()}
        </Text>
        <Text dimColor={true}>Exiting OpenFlow...</Text>
      </Box>
    </Box>
  );
}

export default ExitFlow;
