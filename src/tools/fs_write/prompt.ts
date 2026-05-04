export const DESCRIPTION = 'Write contents to a file (creates or overwrites)'

export const PROMPT = `Write content to a file, creating it if it doesn't exist or overwriting if it does.

## When to Use
- Create new files from scratch
- Replace the entire contents of an existing file
- Generate configuration files, source files, data files, etc.

## Approach
- Provide an absolute file_path (or relative to workspace) and the full content string
- If the file exists, you should pair with fs_read first to satisfy freshness checks and be aware of current content
- Never create documentation files (*.md, README) proactively unless explicitly requested
- Ensure the content is complete; previous content will be fully replaced

## Parameters
- file_path (required): Path to the file to write
- content (required): Full text content to write

## Output
- Confirmation with bytes written
- For overwrites, a diff may be shown

## Constraints
- file_path must be within the workspace
- Will fail if the file was read earlier and then modified externally (stale check)
- Large writes are permitted but may impact performance

## Safety/Limitations
- Existing file content is permanently replaced
- No automatic backups; use version control awareness
- Cannot write outside the sandbox

## Avoid Repetition
- Do not write the same file repeatedly with identical content; if the write fails, diagnose the cause (permissions, stale file, disk full)
- After writing a file, if you need to make minor adjustments, use fs_edit instead of rewriting whole file
- Avoid creating temporary files that are never cleaned up; consider their lifecycle
- If the file already exists and you only need to change a few lines, read it first then use fs_edit or fs_multi_edit

## Examples
- Create a new .env file: file_path=".env", content="API_KEY=abc123"
- Overwrite a config after reading it: read then write with modified JSON

## Notes
- Only use emojis if the user explicitly requests it
- For Jupyter notebooks, use NotebookEditTool
- This tool is not for appending; to append, read and rewrite`