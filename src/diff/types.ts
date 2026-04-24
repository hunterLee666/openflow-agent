export interface DiffBlock {
  type: "added" | "removed" | "context";
  lines: string[];
  oldStart?: number;
  newStart?: number;
}

export interface DiffResult {
  blocks: DiffBlock[];
  addedCount: number;
  removedCount: number;
  hasChanges: boolean;
}

export interface DiffRenderer {
  render(diff: DiffResult): string;
  renderInline(oldText: string, newText: string): string;
}
