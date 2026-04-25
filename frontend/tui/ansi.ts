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

export const SHOW_CURSOR = "\x1b[?25h";
export const HIDE_CURSOR = "\x1b[?25l";

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, "");
}

export function ansiWidth(str: string): number {
  return stripAnsi(str).length;
}

export function colorize(text: string, color: string): string {
  const colorCode = FOREGROUND_COLORS[color] || "";
  return colorCode ? `${colorCode}${text}${ANSI_CODES.RESET}` : text;
}

export function bg(text: string, color: string): string {
  const colorCode = BACKGROUND_COLORS[color] || "";
  return colorCode ? `${colorCode}${text}${ANSI_CODES.RESET}` : text;
}

export function bold(text: string): string {
  return `${ANSI_CODES.BOLD}${text}${ANSI_CODES.RESET}`;
}

export function dim(text: string): string {
  return `${ANSI_CODES.DIM}${text}${ANSI_CODES.RESET}`;
}

export function underline(text: string): string {
  return `${ANSI_CODES.UNDERLINE}${text}${ANSI_CODES.RESET}`;
}

export function italic(text: string): string {
  return `${ANSI_CODES.ITALIC}${text}${ANSI_CODES.RESET}`;
}
