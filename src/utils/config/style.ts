import chalk from 'chalk';

// Simple theme colors as strings for Ink (ANSI names or hex)
export const THEME = {
  primary: 'blue',
  secondary: 'gray',
  success: 'green',
  error: 'red',
  warning: 'yellow',
  info: 'cyan',
  border: 'gray',
  background: 'black',
  text: 'white',
  textMuted: 'gray',
  textDim: 'gray',
  secondaryText: 'gray',
  openflow: 'magenta',
};

export const COLORS = {
  // Basic ANSI
  reset: chalk.reset,
  bright: chalk.bold,
  dim: chalk.dim,
  underline: chalk.underline,

  // Semantic
  info: chalk.blue,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,

  // Brand
  openflow: chalk.magenta,

  // Status colors
  pending: chalk.yellow,
  running: chalk.cyan,
  completed: chalk.green,
  failed: chalk.red,
};

export function styleToken(token: string): string {
  return chalk.cyan(token);
}

export function styleValue(value: string): string {
  return chalk.white(value);
}

export function styleKey(key: string): string {
  return chalk.yellow(key);
}

export { chalk };
