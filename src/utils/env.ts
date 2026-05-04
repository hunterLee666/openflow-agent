import { platform as osPlatform } from 'os';

const terminal = (() => {
  const term = process.env.TERM_PROGRAM || process.env.TERM || '';
  if (term.includes('iTerm')) return 'iTerm.app';
  if (term.includes('VSCode')) return 'vscode';
  return term;
})();

export const env = {
  terminal,
  platform: osPlatform(),
  // Add more as needed
};