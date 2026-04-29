import { FileReadTool } from '@tools/FileReadTool/FileReadTool'

export const PROMPT = `Writes a file to the local filesystem.

Approach:
- This tool will overwrite the existing file if there is one at the provided path
- If this is an existing file, you MUST use the ${FileReadTool.name} tool first to read the file's contents
- ALWAYS prefer editing existing files in the codebase, NEVER write new files unless explicitly required
- NEVER proactively create documentation files (*.md) or README files
- Only use emojis if the user explicitly requests it

Output:
- Confirmation that the file was created or updated
- For updates, shows a diff of the changes
- Line count of the written content

Constraints:
- This tool will fail if you did not read the file first (for existing files)
- Cannot write Jupyter notebooks (.ipynb) - use NotebookEdit tool instead
- The file_path parameter must be an absolute path`
