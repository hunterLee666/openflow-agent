import React, { type ReactNode, type ReactElement, useState, useImperativeHandle, forwardRef, useRef, useEffect } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { useInput } from "../hooks/useInput.js";

export interface ScrollBoxProps {
  children?: ReactNode;
  height?: number | string;
  maxHeight?: number;
  showScrollbar?: boolean;
  flexGrow?: number;
  overflowY?: "visible" | "hidden" | "scroll" | "auto";
  autoScrollToBottom?: boolean;
}

export interface ScrollBoxRef {
  scrollToBottom: () => void;
}

export const ScrollBox = forwardRef<ScrollBoxRef, ScrollBoxProps>(function ScrollBox({
  children,
  height,
  maxHeight = 20,
  showScrollbar = true,
  flexGrow,
  overflowY,
  autoScrollToBottom = false,
}, ref) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      const childArray = React.Children.toArray(children);
      const maxScroll = Math.max(0, childArray.length - (height ? (typeof height === 'number' ? height : maxHeight) : maxHeight));
      setScrollPosition(maxScroll);
    },
  }));

  useInput({
    onArrowUp: () => {
      setScrollPosition((prev) => Math.max(0, prev - 1));
    },
    onArrowDown: () => {
      const childArray = React.Children.toArray(children);
      const visibleCount = typeof height === 'number' ? height : maxHeight;
      setScrollPosition((prev) => Math.min(childArray.length - visibleCount, prev + 1));
    },
    onPageUp: () => {
      setScrollPosition((prev) => Math.max(0, prev - 10));
    },
    onPageDown: () => {
      const childArray = React.Children.toArray(children);
      const visibleCount = typeof height === 'number' ? height : maxHeight;
      setScrollPosition((prev) => Math.min(childArray.length - visibleCount, prev + 10));
    },
    onHome: () => {
      setScrollPosition(0);
    },
    onEnd: () => {
      const childArray = React.Children.toArray(children);
      const visibleCount = typeof height === 'number' ? height : maxHeight;
      setScrollPosition(childArray.length - visibleCount);
    },
  });

  const childArray = React.Children.toArray(children);
  const visibleCount = typeof height === 'number' ? height : maxHeight;
  const visibleChildren = childArray.slice(scrollPosition, scrollPosition + visibleCount);

  useEffect(() => {
    if (autoScrollToBottom) {
      const maxScroll = Math.max(0, childArray.length - visibleCount);
      setScrollPosition(maxScroll);
    }
  }, [autoScrollToBottom, childArray.length, visibleCount]);

  return (
    <Box flexDirection="column" height={height} flexGrow={flexGrow} overflowY={overflowY}>
      <Box flexDirection="column" flex={1} overflow="hidden" ref={containerRef}>
        {visibleChildren}
      </Box>

      {showScrollbar && childArray.length > visibleCount && (
        <Box
          flexDirection="row"
          alignItems="center"
          padding={{ top: 0, bottom: 0 }}
          style={{ fontSize: 8 }}
        >
          <Text color="dim">
            {scrollPosition + 1}-
            {Math.min(scrollPosition + visibleCount, childArray.length)}
            /{childArray.length}
          </Text>
        </Box>
      )}
    </Box>
  );
});

export default ScrollBox;