import React, { type ReactNode, type ReactElement, useState, useCallback } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { useInput } from "../hooks/useInput.js";

export interface SelectOption<T = string> {
  label: string;
  value: T;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps<T = string> {
  options: SelectOption<T>[];
  value?: T;
  onChange?: (value: T) => void;
  placeholder?: string;
  label?: string;
  multi?: boolean;
  maxHeight?: number;
}

export function Select<T = string>({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  label,
  maxHeight = 10,
}: SelectProps<T>): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectedOption = options.find((opt) => opt.value === value);

  const open = useCallback(() => {
    setIsOpen(true);
    const idx = options.findIndex((opt) => opt.value === value);
    setSelectedIndex(idx >= 0 ? idx : 0);
  }, [options, value]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const confirm = useCallback(() => {
    if (options[selectedIndex] && !options[selectedIndex].disabled) {
      onChange?.(options[selectedIndex].value);
    }
    close();
  }, [options, selectedIndex, onChange, close]);

  useInput({
    onEnter: () => {
      if (isOpen) {
        confirm();
      } else {
        open();
      }
    },
    onEscape: () => {
      if (isOpen) {
        close();
      }
    },
    onArrowUp: () => {
      if (isOpen) {
        setSelectedIndex((prev) => {
          let newIndex = prev;
          do {
            newIndex = newIndex > 0 ? newIndex - 1 : options.length - 1;
          } while (options[newIndex]?.disabled && newIndex !== prev);
          return newIndex;
        });
      }
    },
    onArrowDown: () => {
      if (isOpen) {
        setSelectedIndex((prev) => {
          let newIndex = prev;
          do {
            newIndex = newIndex < options.length - 1 ? newIndex + 1 : 0;
          } while (options[newIndex]?.disabled && newIndex !== prev);
          return newIndex;
        });
      }
    },
  });

  const visibleOptions = options.slice(0, maxHeight);

  return (
    <Box flexDirection="column">
      {label && (
        <Box padding={{ bottom: 1 }}>
          <Text bold color="brightWhite">
            {label}
          </Text>
        </Box>
      )}

      <Box
        flexDirection="row"
        alignItems="center"
        padding={1}
        style={{
          backgroundColor: "#2a2a3e",
          border: "1px solid #444",
          borderRadius: 4,
        }}
        onClick={() => (isOpen ? close() : open())}
      >
        <Box flex={1}>
          <Text color={selectedOption ? "white" : "dim"}>
            {selectedOption?.label || placeholder}
          </Text>
        </Box>
        <Text color="dim">{isOpen ? "▲" : "▼"}</Text>
      </Box>

      {isOpen && (
        <Box
          flexDirection="column"
          maxHeight={maxHeight}
          overflow="auto"
          margin={{ top: 1 }}
          padding={1}
          style={{
            backgroundColor: "#1a1a2e",
            border: "1px solid #444",
            borderRadius: 4,
          }}
        >
          {visibleOptions.map((option, index) => (
            <Box
              key={String(option.value)}
              flexDirection="row"
              alignItems="center"
              padding={{ top: "0", bottom: "0", left: 1, right: 1 }}
              style={{
                backgroundColor:
                  index === selectedIndex ? "#3a3a5e" : "transparent",
                cursor: option.disabled ? "not-allowed" : "pointer",
                opacity: option.disabled ? 0.5 : 1,
              }}
              onClick={() => {
                if (!option.disabled) {
                  onChange?.(option.value);
                  close();
                }
              }}
            >
              <Box flex={1}>
                <Text
                  color={
                    option.disabled
                      ? "dim"
                      : index === selectedIndex
                        ? "brightWhite"
                        : "white"
                  }
                >
                  {option.label}
                </Text>
              </Box>
              {option.description && (
                <Text color="dim" style={{ fontSize: 10 }}>
                  {option.description}
                </Text>
              )}
              {option.value === value && (
                <Text color="cyan" style={{ marginLeft: 4 }}>
                  ✓
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default Select;
