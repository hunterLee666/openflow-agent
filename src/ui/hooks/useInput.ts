import { useEffect, useCallback, useRef } from "react";

export interface KeyEvent {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

export interface UseInputOptions {
  onKeyDown?: (key: KeyEvent) => void;
  onKeyUp?: (key: KeyEvent) => void;
  onEscape?: () => void;
  onEnter?: () => void;
  onBackspace?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  onTab?: () => void;
  onCtrlC?: () => void;
  onCtrlL?: () => void;
  onCtrlR?: () => void;
  onPageUp?: () => void;
  onPageDown?: () => void;
  onHome?: () => void;
  onEnd?: () => void;
  isActive?: boolean;
}

function parseKeyString(key: string): KeyEvent {
  const ctrl = key.startsWith("\x1b");
  const alt = key.includes("\x1b[");
  const shift = false;

  let normalizedKey = key;
  if (key.startsWith("\x1b[") && key.length > 3) {
    normalizedKey = key.slice(3);
  }

  return {
    key: normalizedKey,
    ctrl,
    shift,
    alt,
    meta: false,
  };
}

export function useInput(options: UseInputOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!process.stdin.isTTY) {
      return;
    }

    let buffer = "";

    const handleData = (data: Buffer) => {
      buffer += data.toString();

      while (buffer.length > 0) {
        let key: string | null = null;
        let consumed = 0;

        if (buffer.startsWith("\x1b")) {
          if (buffer.startsWith("\x1b[") || buffer.startsWith("\x1bO")) {
            if (buffer.length >= 3) {
              if (buffer.startsWith("\x1b[A")) {
                key = "ArrowUp";
                consumed = 3;
              } else if (buffer.startsWith("\x1b[B")) {
                key = "ArrowDown";
                consumed = 3;
              } else if (buffer.startsWith("\x1b[C")) {
                key = "ArrowRight";
                consumed = 3;
              } else if (buffer.startsWith("\x1b[D")) {
                key = "ArrowLeft";
                consumed = 3;
              } else if (buffer.startsWith("\x1b[5~")) {
                key = "PageUp";
                consumed = 4;
              } else if (buffer.startsWith("\x1b[6~")) {
                key = "PageDown";
                consumed = 4;
              } else if (buffer.startsWith("\x1b[H")) {
                key = "Home";
                consumed = 3;
              } else if (buffer.startsWith("\x1b[F")) {
                key = "End";
                consumed = 3;
              } else if (buffer.startsWith("\x1b[Z")) {
                key = "Tab";
                consumed = 3;
              } else if (buffer.startsWith("\x1b[3~")) {
                key = "Delete";
                consumed = 4;
              } else {
                key = buffer.slice(0, 4);
                consumed = 4;
              }
            } else {
              buffer = "";
              break;
            }
          } else if (buffer.length >= 2) {
            key = "Escape";
            consumed = 2;
          } else {
            buffer = "";
            break;
          }
        } else if (buffer.startsWith("\x03")) {
          key = "CtrlC";
          consumed = 1;
        } else if (buffer.startsWith("\x0c")) {
          key = "CtrlL";
          consumed = 1;
        } else if (buffer.startsWith("\x12")) {
          key = "CtrlR";
          consumed = 1;
        } else if (buffer.startsWith("\x7f")) {
          key = "Backspace";
          consumed = 1;
        } else if (buffer.startsWith("\x0d")) {
          key = "Enter";
          consumed = 1;
        } else if (buffer.startsWith("\x09")) {
          key = "Tab";
          consumed = 1;
        } else if (buffer.charCodeAt(0) >= 32) {
          key = buffer[0];
          consumed = 1;
        } else {
          key = buffer[0];
          consumed = 1;
        }

        if (key === null || consumed === 0) {
          buffer = "";
          break;
        }

        const keyEvent: KeyEvent = {
          key,
          ctrl: key === "CtrlC" || key === "CtrlL" || key === "CtrlR",
          shift: false,
          alt: buffer.startsWith("\x1b"),
          meta: false,
        };

        if (keyEvent.ctrl && keyEvent.key === "c") {
          optionsRef.current.onCtrlC?.();
        } else if (keyEvent.ctrl && keyEvent.key === "l") {
          optionsRef.current.onCtrlL?.();
        } else if (keyEvent.ctrl && keyEvent.key === "r") {
          optionsRef.current.onCtrlR?.();
        } else if (keyEvent.key === "Escape") {
          optionsRef.current.onEscape?.();
        } else if (keyEvent.key === "Enter") {
          optionsRef.current.onEnter?.();
        } else if (keyEvent.key === "Backspace") {
          optionsRef.current.onBackspace?.();
        } else if (keyEvent.key === "ArrowUp") {
          optionsRef.current.onArrowUp?.();
        } else if (keyEvent.key === "ArrowDown") {
          optionsRef.current.onArrowDown?.();
        } else if (keyEvent.key === "ArrowLeft") {
          optionsRef.current.onArrowLeft?.();
        } else if (keyEvent.key === "ArrowRight") {
          optionsRef.current.onArrowRight?.();
        } else if (keyEvent.key === "Tab") {
          optionsRef.current.onTab?.();
        } else if (keyEvent.key === "PageUp") {
          optionsRef.current.onPageUp?.();
        } else if (keyEvent.key === "PageDown") {
          optionsRef.current.onPageDown?.();
        } else if (keyEvent.key === "Home") {
          optionsRef.current.onHome?.();
        } else if (keyEvent.key === "End") {
          optionsRef.current.onEnd?.();
        }

        optionsRef.current.onKeyDown?.(keyEvent);

        buffer = buffer.slice(consumed);
      }
    };

    process.stdin.setRawMode?.(true);
    process.stdin.resume?.();
    process.stdin.on("data", handleData);

    return () => {
      process.stdin.pause?.();
      process.stdin.setRawMode?.(false);
      process.stdin.off("data", handleData);
    };
  }, []);
}

export default useInput;
