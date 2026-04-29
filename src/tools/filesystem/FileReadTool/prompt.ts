const MAX_LINES_TO_READ = 2000
const MAX_LINE_LENGTH = 2000

export const DESCRIPTION = 'Read a file from the local filesystem.'

export const PROMPT = `Read a file from the local filesystem.

Approach:
- Use this tool to read any file on the machine
- The file_path parameter must be an absolute path, not a relative path
- By default, reads up to ${MAX_LINES_TO_READ} lines starting from the beginning
- Optionally specify offset and limit for large files, but reading whole file is recommended
- Call multiple tools in parallel to read multiple potentially useful files
- Always use this tool to view screenshots when user provides a path

Output:
- File contents with line numbers (cat -n format, starting at 1)
- For images (PNG, JPG, etc), contents are presented visually
- For Jupyter notebooks (.ipynb), returns all cells with outputs
- Lines longer than ${MAX_LINE_LENGTH} characters are truncated
- Empty files return a system reminder warning

Constraints:
- Cannot read directories (use Bash ls instead)
- Maximum ${MAX_LINES_TO_READ} lines per read by default
- If file does not exist, an error will be returned
- Assume this tool can read all files on the machine`
