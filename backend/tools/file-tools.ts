import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import type { ToolDefinition, ToolContext } from "../types/index.js";

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read the contents of a file at the given path",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative or absolute file path" },
      offset: { type: "number", description: "Line offset to start reading from" },
      limit: { type: "number", description: "Maximum number of lines to read" },
    },
    required: ["path"],
  },
  isConcurrencySafe: true,
  isReadOnly: true,
  handler: async (input: unknown, ctx: ToolContext) => {
    const { path, offset, limit } = input as { path: string; offset?: number; limit?: number };
    const fullPath = resolve(ctx.cwd, path);
    const content = await readFile(fullPath, "utf-8");
    const lines = content.split("\n");
    const start = offset ? offset - 1 : 0;
    const end = limit ? start + limit : lines.length;
    return lines.slice(start, end).join("\n");
  },
};

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Write content to a file at the given path",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative or absolute file path" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },
  isConcurrencySafe: false,
  isReadOnly: false,
  handler: async (input: unknown, ctx: ToolContext) => {
    const { path, content } = input as { path: string; content: string };
    const fullPath = resolve(ctx.cwd, path);
    await writeFile(fullPath, content, "utf-8");
    return `Wrote ${content.length} bytes to ${path}`;
  },
};

export const listDirectoryTool: ToolDefinition = {
  name: "list_directory",
  description: "List files and directories at the given path",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Directory path" },
    },
    required: ["path"],
  },
  isConcurrencySafe: true,
  isReadOnly: true,
  handler: async (input: unknown, ctx: ToolContext) => {
    const { path } = input as { path: string };
    const fullPath = resolve(ctx.cwd, path);
    const entries = await readdir(fullPath, { withFileTypes: true });
    const results = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(fullPath, entry.name);
        const info = await stat(entryPath);
        return {
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          size: info.size,
        };
      }),
    );
    return JSON.stringify(results, null, 2);
  },
};

export const searchFilesTool: ToolDefinition = {
  name: "search_files",
  description: "Search for files matching a pattern in the project",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern or substring to search" },
      path: { type: "string", description: "Base directory to search in" },
    },
    required: ["pattern"],
  },
  isConcurrencySafe: true,
  isReadOnly: true,
  handler: async (input: unknown, ctx: ToolContext) => {
    const { pattern, path = "." } = input as { pattern: string; path?: string };
    const basePath = resolve(ctx.cwd, path);
    const results: string[] = [];

    async function scan(dir: string) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          await scan(fullPath);
        } else if (entry.name.includes(pattern) || fullPath.includes(pattern)) {
          results.push(relative(basePath, fullPath));
        }
      }
    }

    await scan(basePath);
    return results.join("\n") || "No matches found";
  },
};

export const bashTool: ToolDefinition = {
  name: "bash",
  description: "Execute a bash command in the project directory",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The bash command to execute" },
      timeout: { type: "number", description: "Timeout in milliseconds" },
    },
    required: ["command"],
  },
  isConcurrencySafe: false,
  isReadOnly: false,
  handler: async (input: unknown, ctx: ToolContext) => {
    const { command, timeout = 30000 } = input as { command: string; timeout?: number };
    const proc = Bun.spawn(["bash", "-c", command], {
      cwd: ctx.cwd,
      stdout: "pipe",
      stderr: "pipe",
      signal: ctx.signal,
    });

    const timer = setTimeout(() => {
      proc.kill();
    }, timeout);

    try {
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;
      clearTimeout(timer);

      if (exitCode !== 0) {
        return `Exit code ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
      }
      return stdout || "(no output)";
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  },
};

export function getDefaultTools(): ToolDefinition[] {
  return [readFileTool, writeFileTool, listDirectoryTool, searchFilesTool, bashTool];
}
