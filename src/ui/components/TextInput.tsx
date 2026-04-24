import React, {
  type ChangeEvent,
  type KeyboardEvent,
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { Text } from "./Text.js";
import { Box } from "./Box.js";
import { ansiWidth } from "../ansi.js";

export interface TextInputProps {
  value: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  mask?: string;
  multiline?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  showCursor?: boolean;
  cursorPosition?: number;
  onCursorChange?: (position: number) => void;
  inputFilter?: (input: string) => string;
}

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
  const [internalValue, setInternalValue] = useState(value);
  const [cursor, setCursor] = useState(cursorPosition ?? value.length);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInternalValue(value);
    if (cursorPosition !== undefined) {
      setCursor(cursorPosition);
    }
  }, [value, cursorPosition]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      let newValue = (e.target as unknown as { value: string }).value;

      if (maxLength && newValue.length > maxLength) {
        newValue = newValue.slice(0, maxLength);
      }

      if (inputFilter) {
        newValue = inputFilter(newValue);
      }

      setInternalValue(newValue);
      setCursor(newValue.length);
      onChange?.(newValue);
      onCursorChange?.(newValue.length);
    },
    [maxLength, inputFilter, onChange, onCursorChange]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "Enter":
          if (!e.shiftKey || !multiline) {
            e.preventDefault();
            if (internalValue.trim()) {
              onSubmit?.(internalValue);
              setInternalValue("");
              setCursor(0);
            }
          }
          break;
        case "Escape":
          e.preventDefault();
          onCancel?.();
          break;
        case "ArrowLeft":
          setCursor((prev) => Math.max(0, prev - 1));
          onCursorChange?.(Math.max(0, cursor - 1));
          break;
        case "ArrowRight":
          setCursor((prev) => Math.min(internalValue.length, prev + 1));
          onCursorChange?.(Math.min(internalValue.length, cursor + 1));
          break;
        case "Home":
          setCursor(0);
          onCursorChange?.(0);
          break;
        case "End":
          setCursor(internalValue.length);
          onCursorChange?.(internalValue.length);
          break;
        case "Backspace":
          if (cursor > 0) {
            const newValue =
              internalValue.slice(0, cursor - 1) + internalValue.slice(cursor);
            setInternalValue(newValue);
            setCursor((prev) => prev - 1);
            onChange?.(newValue);
            onCursorChange?.(cursor - 1);
          }
          e.preventDefault();
          break;
        case "Delete":
          if (cursor < internalValue.length) {
            const newValue =
              internalValue.slice(0, cursor) + internalValue.slice(cursor + 1);
            setInternalValue(newValue);
            onChange?.(newValue);
          }
          e.preventDefault();
          break;
      }
    },
    [internalValue, cursor, multiline, onSubmit, onCancel, onChange, onCursorChange]
  );

  useEffect(() => {
    if (autoFocus && inputRef.current && !disabled) {
      (inputRef.current as unknown as { focus: () => void }).focus();
    }
  }, [autoFocus, disabled]);

  const displayValue = mask ? mask.repeat(internalValue.length) : internalValue;
  const visibleChars = 60;
  const startOffset = Math.max(0, cursor - visibleChars + 1);
  const beforeCursor = displayValue.slice(startOffset, cursor);
  const cursorChar = displayValue[cursor] || " ";

  return (
    <Box flexDirection="row" alignItems="center">
      {prefix && <Box margin={{ right: 1 }}>{prefix}</Box>}
      {startOffset > 0 && (
        <Text color="dim">...</Text>
      )}
      <Text>{beforeCursor}</Text>
      {showCursor && !disabled && (
        <Text inverse bold={!mask}>
          {mask ? (mask[0] || "•") : cursorChar}
        </Text>
      )}
      <Text dim={!showCursor || disabled}>
        {displayValue.slice(cursor + 1)}
      </Text>
      {suffix && <Box margin={{ left: 1 }}>{suffix}</Box>}
      <input
        ref={inputRef}
        type="text"
        value={internalValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        readOnly={readOnly}
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 1,
          height: 1,
        }}
        tabIndex={-1}
      />
    </Box>
  );
}

export default TextInput;
