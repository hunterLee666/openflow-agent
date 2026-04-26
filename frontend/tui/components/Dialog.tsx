import React, { type ReactNode, type ReactElement } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { Button } from "./Button.js";
import { z } from "zod";

export const DialogPropsSchema = z.object({
  isOpen: z.boolean(),
  title: z.string().optional(),
  children: z.any().optional(),
  footer: z.any().optional(),
  width: z.union([z.number(), z.string()]).optional(),
  onClose: z.function().returns(z.void()).optional(),
})
export type DialogProps = z.infer<typeof DialogPropsSchema>

export function Dialog({
  isOpen,
  title,
  children,
  footer,
  width = 60,
}: DialogProps): ReactElement | null {
  if (!isOpen) {
    return null;
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
      style={{ backgroundColor: "rgba(0, 0, 0, 0.7)" }}
    >
      <Box
        flexDirection="column"
        width={width}
        maxWidth={90}
        maxHeight={80}
        backgroundColor="#1a1a2e"
        style={{ border: "1px solid #444" }}
        overflow="hidden"
      >
        {title && (
          <Box
            flexDirection="row"
            alignItems="center"
            padding={1}
            style={{ borderBottom: "1px solid #333" }}
          >
            <Text bold color="brightWhite">
              {title}
            </Text>
            <Box flex={1} />
            <Text color="dim" style={{ cursor: "pointer" }}>
              [X]
            </Text>
          </Box>
        )}

        <Box flexDirection="column" flex={1} padding={1} overflow="auto">
          {children}
        </Box>

        {footer && (
          <Box
            flexDirection="row"
            justifyContent="flex-end"
            gap={1}
            padding={1}
            style={{ borderTop: "1px solid #333" }}
          >
            {footer}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title = "Confirm",
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps): ReactElement | null {
  return (
    <Dialog isOpen={isOpen} title={title} width={40}>
      {message && (
        <Box padding={1}>
          <Text>{message}</Text>
        </Box>
      )}
      <Box flexDirection="row" justifyContent="flex-end" gap={1} padding={1}>
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button onClick={onConfirm} variant={danger ? "danger" : "primary"}>
          {confirmLabel}
        </Button>
      </Box>
    </Dialog>
  );
}

export default Dialog;
