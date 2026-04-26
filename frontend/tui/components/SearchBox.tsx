import React, { type ReactElement, useState } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { useInput } from "../hooks/useInput.js";
import { z } from "zod";

export const SearchBoxPropsSchema = z.object({
  query: z.string(),
  onQueryChange: z.function().args(z.string()).returns(z.void()).optional(),
  placeholder: z.string().optional(),
  prefix: z.string().optional(),
  width: z.union([z.number(), z.string()]).optional(),
  onSubmit: z.function().returns(z.void()).optional(),
  onCancel: z.function().returns(z.void()).optional(),
})
export type SearchBoxProps = z.infer<typeof SearchBoxPropsSchema>

export function SearchBox({
  query,
  onQueryChange,
  placeholder = "Search...",
  prefix = "⌕",
  width,
  onSubmit,
  onCancel,
}: SearchBoxProps): ReactElement {
  const [cursorPosition, setCursorPosition] = useState(query.length);
  const [isFocused, setIsFocused] = useState(true);

  const handleKeyDown = (key: string, ctrl: boolean) => {
    if (key === "Escape" || (ctrl && key === "c")) {
      onCancel?.();
    } else if (key === "Enter") {
      onSubmit?.();
    } else if (key === "Backspace") {
      if (cursorPosition > 0) {
        const newQuery = query.slice(0, cursorPosition - 1) + query.slice(cursorPosition);
        onQueryChange?.(newQuery);
        setCursorPosition((prev) => Math.max(0, prev - 1));
      }
    } else if (key === "Delete") {
      if (cursorPosition < query.length) {
        const newQuery = query.slice(0, cursorPosition) + query.slice(cursorPosition + 1);
        onQueryChange?.(newQuery);
      }
    } else if (key === "ArrowLeft") {
      setCursorPosition((prev) => Math.max(0, prev - 1));
    } else if (key === "ArrowRight") {
      setCursorPosition((prev) => Math.min(query.length, prev + 1));
    } else if (key === "Home") {
      setCursorPosition(0);
    } else if (key === "End") {
      setCursorPosition(query.length);
    } else if (key.length === 1 && !ctrl) {
      const newQuery = query.slice(0, cursorPosition) + key + query.slice(cursorPosition);
      onQueryChange?.(newQuery);
      setCursorPosition((prev) => prev + 1);
    }
  };

  useInput({
    onKeyDown: (event) => {
      if (isFocused) {
        handleKeyDown(event.key, event.ctrl);
      }
    },
    onEscape: () => {
      if (isFocused) {
        onCancel?.();
      }
    },
    onEnter: () => {
      if (isFocused) {
        onSubmit?.();
      }
    },
    isActive: isFocused,
  });

  const renderContent = () => {
    if (query.length === 0) {
      return (
        <>
          <Text color="dim">{prefix}{" "}</Text>
          <Text dimColor={!isFocused}>{placeholder}</Text>
        </>
      );
    }

    if (!isFocused) {
      return <Text>{query}</Text>;
    }

    return (
      <>
        {query.slice(0, cursorPosition) && (
          <Text>{query.slice(0, cursorPosition)}</Text>
        )}
        <Text inverse={true}>
          {cursorPosition < query.length ? query[cursorPosition] : " "}
        </Text>
        {cursorPosition < query.length && (
          <Text>{query.slice(cursorPosition + 1)}</Text>
        )}
      </>
    );
  };

  return (
    <Box
      flexShrink="0"
      flexDirection="row"
      alignItems="center"
      paddingX={1}
      width={width}
      style={{
        border: "1px solid #444",
        borderRadius: 4,
      }}
    >
      <Text color={isFocused ? "white" : "dim"}>
        {prefix}{" "}
      </Text>
      <Box flexDirection="row" flex={1}>
        {renderContent()}
      </Box>
    </Box>
  );
}

export default SearchBox;
