export const DESCRIPTION =
  'Lists files and directories in a given path. The path parameter must be an absolute path, not a relative path. You should generally prefer the Glob and Grep tools, if you know which directories to search.'

export const PROMPT = `List files and directories in a specific directory (like the Unix 'ls' command).

## When to Use
- Get a directory listing of a known location
- See immediate children of a folder (non-recursive)
- Quick inspection of file names, sizes, and modification times

## Approach
- Provide an absolute path to the directory to list
- For recursive searches or pattern-based discovery, prefer the GlobTool instead
- For searching contents within files, use fs_grep
- Output includes file name, size, modification time, and type (file vs directory)

## Parameters
- path (required): Absolute path to the directory to list
- all (optional): If true, show hidden files (starting with .); default false
- long (optional): If true, show detailed info (size, mtime, mode); default true

## Output
- Array of file/directory entries with:
  - name: base name
  - type: "file" or "directory"
  - size (if long)
  - modified (if long)
  - mode/permissions (if long)

## Constraints
- Path must be within the sandbox
- Does not follow symlinks outside workspace

## Safety/Limitations
- Read-only; does not modify anything
- Large directories may be truncated if the number of entries exceeds limits

## Avoid Repetition
- Do not repeatedly list the same directory without changes; cache results in memory
- If the directory does not exist, avoid retrying unless you expect it to be created
- When exploring, list parent directories first to understand structure before diving into many subdirectories; consider using GlobTool for broad exploration

## Examples
- List root of project: path="/path/to/project"
- Include dotfiles: path="/tmp", all=true
- Simple listing: path="/usr/bin", long=false

## Notes
- Prefer GlobTool for searching by pattern or recursively
- This tool is analogous to 'ls -la' when long=true and all=true`