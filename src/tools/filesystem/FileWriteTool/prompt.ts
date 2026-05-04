import { FileReadTool } from '@tools/FileReadTool/FileReadTool'

export const PROMPT = `Write or overwrite a file on the local filesystem.

## When to Use
- Create a new file that doesn't exist yet
- Replace the entire contents of an existing file
- Generate content from scratch based on requirements

## Approach
- Provide the absolute file_path and the full content you want to write
- If the file already exists, you MUST read it first with ${FileReadTool.name} to satisfy freshness checks and understand existing content
- Prefer editing existing files over rewriting them entirely when making small changes (use FileEditTool instead)
- Never create documentation files (*.md, README) proactively unless explicitly requested by the user
- Ensure the content is complete; the previous file body will be completely replaced

## Parameters
- file_path (required): Absolute path to the file to create/overwrite
- content (required): Full text content to write

## Output
- Confirmation that the file was created or updated
- For existing files, a diff showing what changed
- Line count of the written content

## Constraints
- file_path must be within the sandbox workspace
- Will fail if the file was read earlier and then modified externally (stale read)
- Cannot write Jupyter notebooks (.ipynb); use NotebookEditTool instead
- Must have read the file first if it exists

## Safety/Limitations
- Existing file content is permanently replaced; there is no undo
- Large writes are allowed but may impact performance
- File system permissions: only files within the workspace and writable by the user can be written

## Avoid Repetition
- Do not repeatedly write the same file with identical content; if the write fails, diagnose the error instead of retrying
- After writing a file, if you need to make further changes, use FileEditTool for targeted edits rather than rewriting the whole file
- Avoid writing temporary or intermediate files without a clear cleanup plan; use background tasks with proper lifecycle management
- If the file already exists and you only need to adjust a few lines, use FileEditTool—do not rewrite the entire file

## Examples
- Create a new config file: file_path="/project/.env.example", content="API_KEY=your_key_here"
- Update an existing file after reading it: read first, then write with modified content

## Notes
- Only use emojis if the user explicitly requests it
- For binary data (images, etc.), encode as appropriate (e.g., base64) or use specialized tools`