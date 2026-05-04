import { Command } from 'commander';
import type { GlobalConfig } from '@utils/config';
import { createConfigCommand } from './config';

let commands: Command[] = [];

// Auto-register built-in commands
registerCommand(createConfigCommand());

export function getCommands(): Command[] {
  // Enrich commands with UI-expected properties
  return commands.map(cmd => ({
    ...cmd,
    userFacingName: typeof cmd.userFacingName === 'function' ? cmd.userFacingName : (() => cmd.name || ''),
    description: cmd.description || '',
    isEnabled: typeof cmd.isEnabled === 'function' ? cmd.isEnabled : () => true,
    isHidden: typeof cmd.isHidden === 'boolean' ? cmd.isHidden : false,
  })) as Command[];
}

export function registerCommand(cmd: Command): void {
  commands.push(cmd);
}

export function unregisterCommand(cmd: Command): void {
  const idx = commands.indexOf(cmd);
  if (idx !== -1) {
    commands.splice(idx, 1);
  }
}

export function clearCommands(): void {
  commands = [];
}

// Handler type for commands
export type CommandHandler = (...args: any[]) => any | Promise<any>;

// Helper to create a command
export function createCommand<T extends Command>(cmd: T): T {
  return cmd;
}

// Alias
export const command = createCommand;

// Helper to check if a command exists
export function hasCommand(name: string, cmds?: Command[]): boolean {
  const allCommands = cmds || getCommands();
  return allCommands.some(cmd => cmd.name === name);
}

// Helper to get a command by name
export function getCommand(name: string, cmds?: Command[]): Command | undefined {
  const allCommands = cmds || getCommands();
  return allCommands.find(cmd => cmd.name === name);
}
