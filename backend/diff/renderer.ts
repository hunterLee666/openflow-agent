import type { DiffBlock, DiffResult, DiffRenderer } from "./types.js";

export function computeDiff(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const blocks: DiffBlock[] = [];
  let addedCount = 0;
  let removedCount = 0;

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      // Context line
      const contextLines: string[] = [];
      while (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        contextLines.push(oldLines[i]);
        i++;
        j++;
      }
      blocks.push({ type: "context", lines: contextLines });
    } else {
      // Find next match
      let found = false;
      for (let lookAhead = 1; lookAhead <= 3 && !found; lookAhead++) {
        if (i + lookAhead < oldLines.length && j + lookAhead < newLines.length) {
          if (oldLines[i + lookAhead] === newLines[j + lookAhead]) {
            // Removed lines
            const removed: string[] = [];
            for (let k = 0; k < lookAhead && i < oldLines.length; k++) {
              removed.push(oldLines[i]);
              i++;
              removedCount++;
            }
            if (removed.length > 0) {
              blocks.push({ type: "removed", lines: removed });
            }

            // Added lines
            const added: string[] = [];
            for (let k = 0; k < lookAhead && j < newLines.length; k++) {
              added.push(newLines[j]);
              j++;
              addedCount++;
            }
            if (added.length > 0) {
              blocks.push({ type: "added", lines: added });
            }

            found = true;
          }
        }
      }

      if (!found) {
        if (i < oldLines.length) {
          blocks.push({ type: "removed", lines: [oldLines[i]] });
          removedCount++;
          i++;
        }
        if (j < newLines.length) {
          blocks.push({ type: "added", lines: [newLines[j]] });
          addedCount++;
          j++;
        }
      }
    }
  }

  return {
    blocks,
    addedCount,
    removedCount,
    hasChanges: addedCount > 0 || removedCount > 0,
  };
}

export class TerminalDiffRenderer implements DiffRenderer {
  render(diff: DiffResult): string {
    const lines: string[] = [];

    if (!diff.hasChanges) {
      return "No changes.";
    }

    lines.push(`\x1b[1mDiff: +${diff.addedCount} -${diff.removedCount}\x1b[0m`);
    lines.push("");

    for (const block of diff.blocks) {
      switch (block.type) {
        case "added":
          for (const line of block.lines) {
            lines.push(`\x1b[32m+ ${line}\x1b[0m`);
          }
          break;
        case "removed":
          for (const line of block.lines) {
            lines.push(`\x1b[31m- ${line}\x1b[0m`);
          }
          break;
        case "context":
          for (const line of block.lines) {
            lines.push(`  ${line}`);
          }
          break;
      }
    }

    return lines.join("\n");
  }

  renderInline(oldText: string, newText: string): string {
    const diff = computeDiff(oldText, newText);
    return this.render(diff);
  }
}

export function createDiffRenderer(): DiffRenderer {
  return new TerminalDiffRenderer();
}
