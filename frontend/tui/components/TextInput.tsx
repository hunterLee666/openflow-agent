import React, {
  useState,
  useCallback,
  useEffect,
} from "react";
import { useInput } from "../hooks/useInput.js";
import { Text } from "./Text.js";
import { Box } from "./Box.js";
import { z } from 'zod'

export const TextInputPropsSchema = z.object({
  value: z.string(),
  onChange: z.function().args(z.string()).returns(z.void()).optional(),
  onSubmit: z.function().args(z.string()).returns(z.void()).optional(),
  onCancel: z.function().returns(z.void()).optional(),
  placeholder: z.string().optional(),
  mask: z.string().optional(),
  multiline: z.boolean().optional(),
  maxLength: z.number().positive().int().optional(),
  autoFocus: z.boolean().optional(),
  disabled: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  prefix: z.any().optional(),
  suffix: z.any().optional(),
  showCursor: z.boolean().optional(),
  cursorPosition: z.number().int().nonnegative().optional(),
  onCursorChange: z.function().args(z.number().int()).returns(z.void()).optional(),
  inputFilter: z.function().args(z.string()).returns(z.string()).optional(),
})
export type TextInputProps = z.infer<typeof TextInputPropsSchema>

export function TextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  mask,
  multiline = false,
  maxLength,
  autoFocus = true,
  disabled = false,
  readOnly = false,
  prefix,
  suffix,
  showCursor = true,
  cursorPosition,
  onCursorChange,
  inputFilter,
}: TextInputProps): React.ReactNode {
  const [cursor, setCursor] = useState(cursorPosition ?? value.length);

  useEffect(() => {
    if (cursorPosition !== undefined) {
      setCursor(cursorPosition);
    }
  }, [cursorPosition]);

  useEffect(() => {
    if (cursor > value.length) {
      setCursor(value.length);
    }
  }, [value]);

  useInput({
    isActive: autoFocus && !disabled && !readOnly,
    onKeyDown: (keyEvent) => {
      const { key } = keyEvent;

      // Only handle printable characters, let app.tsx handle special keys
      if (key.length === 1) {
        const newValue =
          value.slice(0, cursor) + key + value.slice(cursor);

        if (maxLength && newValue.length > maxLength) {
          return;
        }

        const filteredValue = inputFilter ? inputFilter(newValue) : newValue;
        onChange?.(filteredValue);
        setCursor((prev) => prev + 1);
        onCursorChange?.(cursor + 1);
      }
    },
  });

  const displayValue = mask ? mask.repeat(value.length) : value;
  const visibleChars = 60;
  const startOffset = Math.max(0, cursor - visibleChars + 1);
  const beforeCursor = displayValue.slice(startOffset, cursor);
  const afterCursor = displayValue.slice(cursor + 1);
  const cursorChar = displayValue[cursor] || " ";

  return (
    <Box flexDirection="row" alignItems="center">
      {prefix && <Box margin={{ right: 1 }}>{prefix}</Box>}
      {startOffset > 0 && (
        <Text color="dim">...</Text>
      )}
      <Text>{beforeCursor}</Text>
      {showCursor && autoFocus && !disabled && (
        <Text inverse bold={!mask}>
          {mask ? (mask[0] || "•") : cursorChar}
        </Text>
      )}
      <Text dim={!showCursor || !autoFocus || disabled}>
        {afterCursor}
      </Text>
      {!displayValue && placeholder && autoFocus && (
        <Text color="dim">{placeholder}</Text>
      )}
      {suffix && <Box margin={{ left: 1 }}>{suffix}</Box>}
    </Box>
  );
}

export default TextInput;
