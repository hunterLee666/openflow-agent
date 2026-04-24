import type { Color } from "./types.js";

export const ANSI_CODES = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  ITALIC: "\x1b[3m",
  UNDERLINE: "\x1b[4m",
  BLINK: "\x1b[5m",
  INVERSE: "\x1b[7m",
  HIDDEN: "\x1b[8m",
  STRIKETHROUGH: "\x1b[9m",
} as const;

export const FOREGROUND_COLORS: Record<string, string> = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
};

export const BACKGROUND_COLORS: Record<string, string> = {
  black: "\x1b[40m",
  red: "\x1b[41m",
  green: "\x1b[42m",
  yellow: "\x1b[43m",
  blue: "\x1b[44m",
  magenta: "\x1b[45m",
  cyan: "\x1b[46m",
  white: "\x1b[47m",
  brightBlack: "\x1b[100m",
  brightRed: "\x1b[101m",
  brightGreen: "\x1b[102m",
  brightYellow: "\x1b[103m",
  brightBlue: "\x1b[104m",
  brightMagenta: "\x1b[105m",
  brightCyan: "\x1b[106m",
  brightWhite: "\x1b[107m",
};

export function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function bgRgb(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

export function hexToRgb(hex: string): Color {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    return { red: 0, green: 0, blue: 0 };
  }
  return {
    red: parseInt(result[1], 16),
    green: parseInt(result[2], 16),
    blue: parseInt(result[3], 16),
  };
}

export function colorToAnsi(color: Color | string): string {
  if (typeof color === "string") {
    return FOREGROUND_COLORS[color] || "";
  }
  return rgb(color.red, color.green, color.blue);
}

export function bgColorToAnsi(color: Color | string): string {
  if (typeof color === "string") {
    return BACKGROUND_COLORS[color] || "";
  }
  return bgRgb(color.red, color.green, color.blue);
}

export function stripAnsi(str: string): string {
  return str.replace(
    /[\x1b\x9b][()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[A-Z_a-z]|\?)|[\x1b\x9b][()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[A-Z_a-z]|\?)/g,
    ""
  );
}

export function ansiWidth(str: string): number {
  return stripAnsi(str).length;
}

export function truncate(str: string, width: number): string {
  const stripped = stripAnsi(str);
  if (stripped.length <= width) {
    return str;
  }
  let result = "";
  let currentWidth = 0;
  let inEscape = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "\x1b") {
      inEscape = true;
      result += char;
      continue;
    }
    if (inEscape) {
      if (char === "m") {
        inEscape = false;
      }
      result += char;
      continue;
    }
    currentWidth++;
    if (currentWidth > width) {
      break;
    }
    result += char;
  }
  return result;
}

export const CURSOR_UP = "\x1b[A";
export const CURSOR_DOWN = "\x1b[B";
export const CURSOR_FORWARD = "\x1b[C";
export const CURSOR_BACKWARD = "\x1b[D";
export const CURSOR_NEXT_LINE = "\x1b[E";
export const CURSOR_PREV_LINE = "\x1b[F";
export const CURSOR_COLUMN = "\x1b[G";
export const CURSOR_POSITION = "\x1b[H";
export const ERASE_DISPLAY = "\x1b[J";
export const ERASE_LINE = "\x1b[K";
export const SCROLL_UP = "\x1b[S";
export const SCROLL_DOWN = "\x1b[T";
export const SHOW_CURSOR = "\x1b[?25h";
export const HIDE_CURSOR = "\x1b[?25l";
export const SCREEN_MODE = "\x1b[?1049h";
export const ALT_SCREEN_MODE = "\x1b[?1047h";
export const NORMAL_SCREEN_MODE = "\x1b[?1047l";
export const RESTORE_CURSOR = "\x1b[u";
export const SAVE_CURSOR = "\x1b[s";
