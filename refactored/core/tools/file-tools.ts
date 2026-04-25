import type { ToolDefinition } from "../types/index.js";
import { readFile, writeFile, access, stat } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { constants } from "node:fs";

export interface FileToolInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

export interface WriteToolInput {
  file_path: string;
  content: string;
}

export interface EditToolInput {
  file_path: string;
  old_str: string;
  new_str: string;
  replace_all?: boolean;
}

export interface MultiEditToolInput {
  file_path: string;
  edits: Array<{ old_str: string; new_str: string }>;
}

export interface NotebookEditInput {
  notebook_path: string;
  cell_id?: string;
  new_source: string;
  cell_type?: "code" | "markdown";
  edit_mode?: "replace" | "insert" | "delete";
}

export function createFileTools(workspaceRoot: string): ToolDefinition[] {
  const safePath = (inputPath: string): string => {
    const resolved = resolve(workspaceRoot, inputPath);
    if (!resolved.startsWith(workspaceRoot)) {
      throw new Error(`Path traversal detected: ${inputPath}`);
    }
    return resolved;
  };

  const tools: ToolDefinition[] = [
    {
      name: "Read",
      description: "Read the contents of a file from the local filesystem. Supports text files, images (PNG, JPG), PDFs, and Jupyter notebooks.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "The absolute path to the file to read" },
          offset: { type: "number", description: "The line number to start reading from (1-indexed)" },
          limit: { type: "number", description: "The number of lines to read" },
        },
        required: ["file_path"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as FileToolInput;
        const filePath = safePath(typed.file_path);
        await access(filePath, constants.R_OK);
        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");
        const startOffset = typed.offset ? typed.offset - 1 : 0;
        const readLimit = typed.limit || 2000;
        const selectedLines = lines.slice(startOffset, startOffset + readLimit);
        return selectedLines
          .map((line, idx) => {
            const lineNum = startOffset + idx + 1;
            return `${lineNum}\t${line}`;
          })
          .join("\n");
      },
    },
    {
      name: "Write",
      description: "Write or overwrite files. For existing files, MUST read with Read tool first. Only create new files when absolutely necessary.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "The absolute path to the file to write" },
          content: { type: "string", description: "The complete file content" },
        },
        required: ["file_path", "content"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as WriteToolInput;
        const filePath = safePath(typed.file_path);
        const dir = dirname(filePath);
        await access(dir, constants.W_OK).catch(async () => {
          const { mkdir } = await import("node:fs/promises");
          await mkdir(dir, { recursive: true });
        });
        await writeFile(filePath, typed.content, "utf-8");
        return `File written: ${relative(workspaceRoot, filePath)}`;
      },
    },
    {
      name: "Edit",
      description: "Perform exact string replacements in files. MUST read file with Read tool first. old_str must be unique in file.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "The absolute path to the file" },
          old_str: { type: "string", description: "Exact text to replace" },
          new_str: { type: "string", description: "Replacement text" },
          replace_all: { type: "boolean", description: "Replace all occurrences (default: false)" },
        },
        required: ["file_path", "old_str", "new_str"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as EditToolInput;
        const filePath = safePath(typed.file_path);
        const content = await readFile(filePath, "utf-8");

        if (!content.includes(typed.old_str)) {
          throw new Error(`old_str not found in file: ${typed.file_path}`);
        }

        const newContent = typed.replace_all
          ? content.replaceAll(typed.old_str, typed.new_str)
          : content.replace(typed.old_str, typed.new_str);

        await writeFile(filePath, newContent, "utf-8");
        return `File edited: ${relative(workspaceRoot, filePath)}`;
      },
    },
    {
      name: "MultiEdit",
      description: "Apply multiple edits to a file in a single operation. Edits are applied sequentially.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "The absolute path to the file" },
          edits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                old_str: { type: "string" },
                new_str: { type: "string" },
              },
              required: ["old_str", "new_str"],
            },
          },
        },
        required: ["file_path", "edits"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as MultiEditToolInput;
        const filePath = safePath(typed.file_path);
        let content = await readFile(filePath, "utf-8");

        for (let i = 0; i < typed.edits.length; i++) {
          const edit = typed.edits[i];
          if (!content.includes(edit.old_str)) {
            throw new Error(`Edit ${i + 1}: old_str not found in file`);
          }
          content = content.replace(edit.old_str, edit.new_str);
        }

        await writeFile(filePath, content, "utf-8");
        return `File edited with ${typed.edits.length} changes: ${relative(workspaceRoot, filePath)}`;
      },
    },
    {
      name: "NotebookEdit",
      description: "Edit Jupyter notebook (.ipynb) cells. Supports replace, insert, and delete modes.",
      inputSchema: {
        type: "object",
        properties: {
          notebook_path: { type: "string", description: "The absolute path to the notebook" },
          cell_id: { type: "string", description: "ID of cell to edit (for insert: new cell inserted after this ID)" },
          new_source: { type: "string", description: "New cell content" },
          cell_type: { type: "string", enum: ["code", "markdown"], description: "code or markdown (required for insert mode)" },
          edit_mode: { type: "string", enum: ["replace", "insert", "delete"], description: "replace (default), insert, or delete" },
        },
        required: ["notebook_path", "new_source"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const typed = input as NotebookEditInput;
        const filePath = safePath(typed.notebook_path);
        const content = await readFile(filePath, "utf-8");
        const notebook = JSON.parse(content);
        const editMode = typed.edit_mode || "replace";

        if (editMode === "replace" && typed.cell_id) {
          const cell = notebook.cells.find((c: { id?: string }) => c.id === typed.cell_id);
          if (cell) {
            cell.source = typed.new_source;
            if (typed.cell_type) cell.cell_type = typed.cell_type;
          }
        } else if (editMode === "insert") {
          const newCell = {
            id: `cell_${Date.now()}`,
            cell_type: typed.cell_type || "code",
            source: typed.new_source,
            outputs: [],
            execution_count: null,
            metadata: {},
          };
          const insertIdx = typed.cell_id
            ? notebook.cells.findIndex((c: { id?: string }) => c.id === typed.cell_id) + 1
            : notebook.cells.length;
          notebook.cells.splice(insertIdx, 0, newCell);
        } else if (editMode === "delete" && typed.cell_id) {
          notebook.cells = notebook.cells.filter((c: { id?: string }) => c.id !== typed.cell_id);
        }

        await writeFile(filePath, JSON.stringify(notebook, null, 2), "utf-8");
        return `Notebook edited: ${relative(workspaceRoot, filePath)}`;
      },
    },
    {
      name: "LS",
      description: "List files and directories in a path. Returns entries with type indicators (D for directory, F for file).",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "The directory path to list" },
        },
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as { path?: string };
        const dirPath = safePath(typed.path || ".");
        const { readdir } = await import("node:fs/promises");
        const entries = await readdir(dirPath, { withFileTypes: true });
        return entries
          .map((e) => `${e.isDirectory() ? "D" : "F"} ${e.name}`)
          .join("\n");
      },
    },
  ];

  return tools;
}
