export const DESCRIPTION = 'Read contents from a file'

export const PROMPT = `Read a file within the sandboxed workspace.

## When to Use
- Inspect the contents of text files, source code, configs, logs, etc.
- Check file structure before editing or deleting
- Retrieve data from files for analysis
- View images or Jupyter notebooks (rendered visually)

## Approach
- Provide a path relative to the sandbox working directory (or absolute path)
- Optional offset and limit let you read chunks of large files; otherwise reads the whole file up to truncation limits
- For multiple files, batch calls in a single turn to minimize latency
- Large files may be truncated; use offset/limit to page through if needed

## Parameters
- path (required): File path (absolute or relative to workspace)
- offset (optional): Starting line number (1-indexed)
- limit (optional): Maximum number of lines to read

## Output
- Content with line numbers (cat -n style)
- For images: visual rendering
- For Jupyter notebooks (.ipynb): all cells with outputs
- Truncation warning if file exceeds limits

## Constraints
- Path must stay inside the sandbox root
- Maximum lines per read: 2000 by default
- Maximum line length: 2000 characters (longer lines are truncated)
- Binary files other than images and notebooks are not supported

## Safety/Limitations
- Read-only; does not modify files
- Integrates with FilePool for stale read detection
- If file is modified externally after being read, subsequent operations may be rejected

## Avoid Repetition
- Do not repeatedly read the same file pointlessly; cache its content in your memory after the first read
- If a file does not exist, avoid immediate retries unless you expect it to be created
- When exploring a directory, use fs_glob to list files first, then read only the relevant ones—do not read every file blindly
- For progressively reading large logs, use offset/limit to read chunks with increasing offsets; avoid re-reading the same chunk

## Examples
- Read a config: path="src/config.ts"
- Read lines 100-150: path="logs/app.log", offset=100, limit=50
- View a PNG: path="assets/diagram.png"
- Inspect a notebook: path="notebooks/analysis.ipynb"

## Notes
- Always use fs_read before fs_edit or fs_write to ensure freshness
- If the file is empty, a system reminder will be returned
- If the file does not exist, an error is returned`