import { useRef, useCallback, useEffect } from 'react';

export interface StreamingMessage {
  sessionId: string;
  messageIndex: number;
  accumulatedContent: string;
}

export interface UseStreamingStateReturn {
  streamingRef: React.MutableRefObject<StreamingMessage | null>;
  startStreaming: (sessionId: string, messageIndex: number, initialContent?: string) => void;
  appendChunk: (chunk: string) => string | null;
  flushContent: () => void;
  stopStreaming: () => StreamingMessage | null;
  getCurrentContent: () => string;
}

export function useStreamingState(
  onFlush?: (sessionId: string, messageIndex: number, content: string) => void
): UseStreamingStateReturn {
  const streamingRef = useRef<StreamingMessage | null>(null);
  const pendingFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlushTimeRef = useRef<number>(0);

  const flushContent = useCallback(() => {
    if (!streamingRef.current) return;

    const { sessionId, messageIndex, accumulatedContent } = streamingRef.current;
    if (accumulatedContent.length === 0) return;

    const now = Date.now();
    const timeSinceLastFlush = now - lastFlushTimeRef.current;

    lastFlushTimeRef.current = now;

    onFlush?.(sessionId, messageIndex, accumulatedContent);
  }, [onFlush]);

  const startStreaming = useCallback((sessionId: string, messageIndex: number, initialContent: string = '') => {
    streamingRef.current = {
      sessionId,
      messageIndex,
      accumulatedContent: initialContent,
    };
    lastFlushTimeRef.current = Date.now();
  }, []);

  const appendChunk = useCallback((chunk: string): string | null => {
    if (!streamingRef.current) {
      return null;
    }

    streamingRef.current.accumulatedContent += chunk;

    const now = Date.now();
    const timeSinceLastFlush = now - lastFlushTimeRef.current;

    if (pendingFlushRef.current) {
      clearTimeout(pendingFlushRef.current);
    }

    if (timeSinceLastFlush >= 50 || chunk.length > 500) {
      flushContent();
      return streamingRef.current.accumulatedContent;
    }

    pendingFlushRef.current = setTimeout(() => {
      flushContent();
      pendingFlushRef.current = null;
    }, 50);

    return streamingRef.current.accumulatedContent;
  }, [flushContent]);

  const stopStreaming = useCallback((): StreamingMessage | null => {
    if (pendingFlushRef.current) {
      clearTimeout(pendingFlushRef.current);
      pendingFlushRef.current = null;
    }

    if (streamingRef.current?.accumulatedContent) {
      flushContent();
    }

    const result = streamingRef.current;
    streamingRef.current = null;
    return result;
  }, [flushContent]);

  const getCurrentContent = useCallback((): string => {
    return streamingRef.current?.accumulatedContent ?? '';
  }, []);

  useEffect(() => {
    return () => {
      if (pendingFlushRef.current) {
        clearTimeout(pendingFlushRef.current);
      }
    };
  }, []);

  return {
    streamingRef,
    startStreaming,
    appendChunk,
    flushContent,
    stopStreaming,
    getCurrentContent,
  };
}