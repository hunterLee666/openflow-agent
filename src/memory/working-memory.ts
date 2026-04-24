import type { WorkingMemory } from "./types.js";

export class DefaultWorkingMemory implements WorkingMemory {
  currentTask = "";
  taskStack: string[] = [];
  contextNotes = new Map<string, string>();
  recentToolResults: Array<{ tool: string; result: string; timestamp: number }> = [];

  setTask(task: string): void {
    this.currentTask = task;
    this.taskStack = [task];
  }

  pushSubtask(subtask: string): void {
    this.taskStack.push(subtask);
    this.currentTask = subtask;
  }

  popSubtask(): string | undefined {
    this.taskStack.pop();
    this.currentTask = this.taskStack[this.taskStack.length - 1] || "";
    return this.currentTask;
  }

  note(key: string, value: string): void {
    this.contextNotes.set(key, value);
  }

  getNote(key: string): string | undefined {
    return this.contextNotes.get(key);
  }

  addToolResult(tool: string, result: string): void {
    this.recentToolResults.push({ tool, result, timestamp: Date.now() });
    if (this.recentToolResults.length > 20) {
      this.recentToolResults.shift();
    }
  }

  getRecentToolResults(limit = 5): Array<{ tool: string; result: string; timestamp: number }> {
    return this.recentToolResults.slice(-limit);
  }

  clear(): void {
    this.currentTask = "";
    this.taskStack = [];
    this.contextNotes.clear();
    this.recentToolResults = [];
  }
}
