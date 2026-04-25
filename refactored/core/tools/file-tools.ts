import { z } from "zod";
import type { InputValidator, ToolValidationContext, ValidationResult } from "./validation.js";
import { defineTool, createWriteTool, createReadOnlyTool } from "./tool-factory.js";
import { readFile, writeFile, access, stat } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { constants } from "node:fs";

const FileReadInputSchema = z.object({
  file_path: z.string().min(1, "file_path 不能为空"),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});

const FileWriteInputSchema = z.object({
  file_path: z.string().min(1, "file_path 不能为空"),
  content: z.string(),
});

const FileEditInputSchema = z.object({
  file_path: z.string().min(1, "file_path 不能为空"),
  old_str: z.string().min(1, "old_str 不能为空"),
  new_str: z.string(),
  replace_all: z.boolean().optional(),
});

const MultiEditInputSchema = z.object({
  file_path: z.string().min(1, "file_path 不能为空"),
  edits: z.array(
    z.object({
      old_str: z.string().min(1, "old_str 不能为空"),
      new_str: z.string(),
    })
  ).min(1, "edits 至少需要一个编辑"),
});

const NotebookEditInputSchema = z.object({
  notebook_path: z.string().min(1, "notebook_path 不能为空"),
  cell_id: z.string().optional(),
  new_source: z.string(),
  cell_type: z.enum(["code", "markdown"]).optional(),
  edit_mode: z.enum(["replace", "insert", "delete"]).optional(),
});

const LSInputSchema = z.object({
  path: z.string().optional(),
});

const FileReadOutputSchema = z.object({
  content: z.string(),
  lineCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

const FileWriteOutputSchema = z.object({
  message: z.string(),
  path: z.string(),
});

function createPathValidator(workspaceRoot: string): InputValidator<any> {
  return async (input: any, ctx: ToolValidationContext): Promise<ValidationResult<any>> => {
    const pathField = input.file_path || input.notebook_path || input.path;
    if (pathField) {
      const resolved = resolve(workspaceRoot, pathField);
      if (!resolved.startsWith(workspaceRoot)) {
        return {
          ok: false,
          error: {
            type: "validation",
            message: `路径必须在 workspace 内: ${pathField}`,
            recoverable: true,
          },
        };
      }
    }
    return { ok: true, data: input };
  };
}

export function createFileTools(workspaceRoot: string) {
  const safePath = (inputPath: string): string => {
    const resolved = resolve(workspaceRoot, inputPath);
    if (!resolved.startsWith(workspaceRoot)) {
      throw new Error(`Path traversal detected: ${inputPath}`);
    }
    return resolved;
  };

  const readFileState = new Map<string, { content: string; readAt: number }>();

  const pathValidator = createPathValidator(workspaceRoot);

  const readTool = createReadOnlyTool({
    name: "Read",
    description: "Read the contents of a file from the local filesystem. Supports text files, images (PNG, JPG), PDFs, and Jupyter notebooks.",
    inputSchema: FileReadInputSchema,
    outputSchema: FileReadOutputSchema,
    validateInput: pathValidator,
    handler: async (input) => {
      const filePath = safePath(input.file_path);
      await access(filePath, constants.R_OK);
      const content = await readFile(filePath, "utf-8");

      readFileState.set(filePath, { content, readAt: Date.now() });

      const lines = content.split("\n");
      const startOffset = input.offset ? input.offset - 1 : 0;
      const readLimit = input.limit || 2000;
      const selectedLines = lines.slice(startOffset, startOffset + readLimit);
      return {
        content: selectedLines
          .map((line, idx) => {
            const lineNum = startOffset + idx + 1;
            return `${lineNum}\t${line}`;
          })
          .join("\n"),
        lineCount: selectedLines.length,
        truncated: lines.length > startOffset + readLimit,
      };
    },
  });

  const writeTool = createWriteTool({
    name: "Write",
    description: "Write or overwrite files. For existing files, MUST read with Read tool first. Only create new files when absolutely necessary.",
    inputSchema: FileWriteInputSchema,
    outputSchema: FileWriteOutputSchema,
    validateInput: pathValidator,
    handler: async (input) => {
      const filePath = safePath(input.file_path);
      const dir = dirname(filePath);
      await access(dir, constants.W_OK).catch(async () => {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(dir, { recursive: true });
      });
      await writeFile(filePath, input.content, "utf-8");
      return {
        message: `File written: ${relative(workspaceRoot, filePath)}`,
        path: relative(workspaceRoot, filePath),
      };
    },
  });

  const editTool = createWriteTool({
    name: "Edit",
    description: "Perform exact string replacements in files. MUST read file with Read tool first. old_str must be unique in file.",
    inputSchema: FileEditInputSchema,
    validateInput: pathValidator,
    handler: async (input) => {
      const filePath = safePath(input.file_path);

      const readState = readFileState.get(filePath);
      if (!readState) {
        throw new Error(
          `File must be read with Read tool before editing. ` +
          `This ensures you have the latest content and prevents hallucinated edits.`
        );
      }

      const content = readState.content;
      const oldStr = input.old_str;

      if (!content.includes(oldStr)) {
        throw new Error(
          `old_str not found in file: ${input.file_path}\n\n` +
          `The file content may have changed since you last read it. ` +
          `Please read the file again with Read tool to get the latest content.`
        );
      }

      const occurrences: number[] = [];
      let idx = content.indexOf(oldStr);
      while (idx !== -1) {
        occurrences.push(idx);
        idx = content.indexOf(oldStr, idx + 1);
      }

      const matchCount = occurrences.length;

      if (matchCount > 1 && !input.replace_all) {
        const lines = content.split("\n");
        const lineNumbers = occurrences.map((pos) => {
          const textBefore = content.slice(0, pos);
          return textBefore.split("\n").length;
        });

        throw new Error(
          `old_str appears ${matchCount} times in the file (lines: ${lineNumbers.join(", ")}). ` +
          `To avoid unintended replacements, old_str must be unique.\n\n` +
          `Options:\n` +
          `1. Make old_str more specific by including surrounding context\n` +
          `2. Set replace_all=true to replace all ${matchCount} occurrences\n` +
          `3. Use MultiEdit to make different replacements at different locations`
        );
      }

      const newContent = input.replace_all
        ? content.replaceAll(oldStr, input.new_str)
        : content.replace(oldStr, input.new_str);

      await writeFile(filePath, newContent, "utf-8");

      readFileState.set(filePath, { content: newContent, readAt: Date.now() });

      const diffLines = [
        `File edited: ${relative(workspaceRoot, filePath)}`,
        "",
        "Changes:",
        `- ${oldStr.split("\n").length} line(s) removed`,
        `+ ${input.new_str.split("\n").length} line(s) added`,
        matchCount > 1 ? `\nReplaced ${matchCount} occurrences` : "",
      ].filter(Boolean);

      return { message: diffLines.join("\n"), path: relative(workspaceRoot, filePath) };
    },
  });

  const multiEditTool = createWriteTool({
    name: "MultiEdit",
    description: "Apply multiple edits to a file in a single operation. Edits are applied sequentially.",
    inputSchema: MultiEditInputSchema,
    validateInput: pathValidator,
    handler: async (input) => {
      const filePath = safePath(input.file_path);

      const readState = readFileState.get(filePath);
      if (!readState) {
        throw new Error(
          `File must be read with Read tool before editing. ` +
          `This ensures you have the latest content and prevents hallucinated edits.`
        );
      }

      let content = readState.content;
      const results: string[] = [];

      for (let i = 0; i < input.edits.length; i++) {
        const edit = input.edits[i];

        if (!content.includes(edit.old_str)) {
          throw new Error(
            `Edit ${i + 1}: old_str not found in file\n\n` +
            `The file content may have changed. ` +
            `Please read the file again with Read tool to get the latest content.`
          );
        }

        const occurrences: number[] = [];
        let idx = content.indexOf(edit.old_str);
        while (idx !== -1) {
          occurrences.push(idx);
          idx = content.indexOf(edit.old_str, idx + 1);
        }

        if (occurrences.length > 1) {
          const lineNumbers = occurrences.map((pos) => {
            const textBefore = content.slice(0, pos);
            return textBefore.split("\n").length;
          });

          throw new Error(
            `Edit ${i + 1}: old_str appears ${occurrences.length} times (lines: ${lineNumbers.join(", ")}). ` +
            `Make old_str more unique or use separate edits for each location.`
          );
        }

        content = content.replace(edit.old_str, edit.new_str);
        results.push(`Edit ${i + 1}: -${edit.old_str.split("\n").length}/+${edit.new_str.split("\n").length} lines`);
      }

      await writeFile(filePath, content, "utf-8");

      readFileState.set(filePath, { content, readAt: Date.now() });

      return {
        message: [
          `File edited with ${input.edits.length} changes: ${relative(workspaceRoot, filePath)}`,
          "",
          ...results,
        ].join("\n"),
        path: relative(workspaceRoot, filePath),
      };
    },
  });

  const notebookEditTool = createWriteTool({
    name: "NotebookEdit",
    description: "Edit Jupyter notebook (.ipynb) cells. Supports replace, insert, and delete modes.",
    inputSchema: NotebookEditInputSchema,
    validateInput: pathValidator,
    handler: async (input) => {
      const filePath = safePath(input.notebook_path);
      const content = await readFile(filePath, "utf-8");
      const notebook = JSON.parse(content);
      const editMode = input.edit_mode || "replace";

      if (editMode === "replace" && input.cell_id) {
        const cell = notebook.cells.find((c: { id?: string }) => c.id === input.cell_id);
        if (cell) {
          cell.source = input.new_source;
          if (input.cell_type) cell.cell_type = input.cell_type;
        }
      } else if (editMode === "insert") {
        const newCell = {
          id: `cell_${Date.now()}`,
          cell_type: input.cell_type || "code",
          source: input.new_source,
          outputs: [],
          execution_count: null,
          metadata: {},
        };
        const insertIdx = input.cell_id
          ? notebook.cells.findIndex((c: { id?: string }) => c.id === input.cell_id) + 1
          : notebook.cells.length;
        notebook.cells.splice(insertIdx, 0, newCell);
      } else if (editMode === "delete" && input.cell_id) {
        notebook.cells = notebook.cells.filter((c: { id?: string }) => c.id !== input.cell_id);
      }

      await writeFile(filePath, JSON.stringify(notebook, null, 2), "utf-8");
      return {
        message: `Notebook edited: ${relative(workspaceRoot, filePath)}`,
        path: relative(workspaceRoot, filePath),
      };
    },
  });

  const lsTool = createReadOnlyTool({
    name: "LS",
    description: "List files and directories in a path. Returns entries with type indicators (D for directory, F for file).",
    inputSchema: LSInputSchema,
    validateInput: pathValidator,
    handler: async (input) => {
      const dirPath = safePath(input.path || ".");
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(dirPath, { withFileTypes: true });
      return {
        entries: entries
          .map((e) => `${e.isDirectory() ? "D" : "F"} ${e.name}`)
          .join("\n"),
        count: entries.length,
      };
    },
  });

  return [readTool, writeTool, editTool, multiEditTool, notebookEditTool, lsTool];
}
