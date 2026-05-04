import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getCwd } from '@utils/state';

const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', '.openflow/instructions.md'];

export function getProjectInstructionFiles(cwd?: string): string[] {
  const dir = cwd || getCwd();
  return INSTRUCTION_FILES.filter(file => existsSync(join(dir, file)));
}

export function readAndConcatProjectInstructionFiles(cwd?: string): string {
  const files = getProjectInstructionFiles(cwd);
  const dir = cwd || getCwd();
  const contents = files.map(file => {
    const path = join(dir, file);
    try {
      return `# ${file}\n\n${readFileSync(path, 'utf-8')}\n`;
    } catch {
      return '';
    }
  });
  return contents.join('\n---\n\n');
}
