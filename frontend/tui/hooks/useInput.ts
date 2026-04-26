import { useEffect, useCallback, useRef } from "react";
import { z } from 'zod'

export const KeyEventSchema = z.object({
  key: z.string(),
  ctrl: z.boolean(),
  shift: z.boolean(),
  alt: z.boolean(),
  meta: z.boolean(),
})
export type KeyEvent = z.infer<typeof KeyEventSchema>

export const UseInputOptionsSchema = z.object({
  onKeyDown: z.function().args(KeyEventSchema).returns(z.void()).optional(),
  onKeyUp: z.function().args(KeyEventSchema).returns(z.void()).optional(),
  onEscape: z.function().returns(z.void()).optional(),
  onEnter: z.function().returns(z.void()).optional(),
  onBackspace: z.function().returns(z.void()).optional(),
  onArrowUp: z.function().returns(z.void()).optional(),
  onArrowDown: z.function().returns(z.void()).optional(),
  onArrowLeft: z.function().returns(z.void()).optional(),
  onArrowRight: z.function().returns(z.void()).optional(),
  onTab: z.function().returns(z.void()).optional(),
  onCtrlC: z.function().returns(z.void()).optional(),
  onCtrlL: z.function().returns(z.void()).optional(),
  onCtrlR: z.function().returns(z.void()).optional(),
  onPageUp: z.function().returns(z.void()).optional(),
  onPageDown: z.function().returns(z.void()).optional(),
  onHome: z.function().returns(z.void()).optional(),
  onEnd: z.function().returns(z.void()).optional(),
  isActive: z.boolean().optional(),
})
export type UseInputOptions = z.infer<typeof UseInputOptionsSchema>

// Global registry for multiple listeners
type ListenerEntry = {
  options: UseInputOptions;
  id: number;
};

let listenerIdCounter = 0;
const listeners: ListenerEntry[] = [];

function notifyListeners(key: string, keyEvent: KeyEvent): boolean {
  // Notify in reverse order (most recently registered first)
  for (let i = listeners.length - 1; i >= 0; i--) {
    const entry = listeners[i];
    if (entry.options.isActive === false) continue;

    const opts = entry.options;

    if (keyEvent.ctrl && key === "c") {
      opts.onCtrlC?.();
    } else if (keyEvent.ctrl && key === "l") {
      opts.onCtrlL?.();
    } else if (keyEvent.ctrl && key === "r") {
      opts.onCtrlR?.();
    } else if (key === "Escape") {
      opts.onEscape?.();
    } else if (key === "Enter") {
      opts.onEnter?.();
    } else if (key === "Backspace") {
      opts.onBackspace?.();
    } else if (key === "ArrowUp") {
      opts.onArrowUp?.();
    } else if (key === "ArrowDown") {
      opts.onArrowDown?.();
    } else if (key === "ArrowLeft") {
      opts.onArrowLeft?.();
    } else if (key === "ArrowRight") {
      opts.onArrowRight?.();
    } else if (key === "Tab") {
      opts.onTab?.();
    } else if (key === "PageUp") {
      opts.onPageUp?.();
    } else if (key === "PageDown") {
      opts.onPageDown?.();
    } else if (key === "Home") {
      opts.onHome?.();
    } else if (key === "End") {
      opts.onEnd?.();
    }

    opts.onKeyDown?.(keyEvent);
  }
  return true;
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
    const id = ++listenerIdCounter;
    listeners.push({ options: optionsRef.current, id });

    return () => {
      const idx = listeners.findIndex(l => l.id === id);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  useEffect(() => {
    if (listeners.length > 1) {
      return; // Only the first listener sets up stdin
    }

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

        notifyListeners(key, keyEvent);

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
