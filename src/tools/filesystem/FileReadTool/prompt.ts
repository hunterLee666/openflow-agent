const MAX_LINES_TO_READ = 2000
const MAX_LINE_LENGTH = 2000

export const DESCRIPTION = 'Read a file from the local filesystem.'

export const PROMPT = `Read a file from the local filesystem.

## When to Use
- Inspect source code, configuration files, or any text file
- View images or Jupyter notebooks (rendered visually)
- Check file contents before editing or deleting
- Gather information from log files or data files

## Approach
- Provide the absolute file_path; relative paths are not accepted
- For large files, you can use offset and limit to read in chunks, but reading the whole file is usually better unless it's extremely large
- If you need to check multiple files, call this tool in parallel to reduce latency
- For Jupyter notebooks (.ipynb), the tool returns all code cells with their outputs
- For images, the content is presented visually (not as raw bytes)

## Parameters
- file_path (required): Absolute path to the file to read
- offset (optional): Starting line number (1-indexed; default 1)
- limit (optional): Maximum number of lines to read (default: 2000)

## Output
- File content with line numbers (cat -n style)
- For images: visual rendering
- For Jupyter notebooks: all cells with outputs
- Lines longer than 2000 chars are truncated
- EOF marker if file is truncated due to size limits

## Constraints
- Path must be within the sandbox workspace
- Very large files may be truncated; use offset/limit to page through if needed
- Binary files other than images and notebooks are not supported

## Safety/Limitations
- File freshness is tracked; if the file is modified externally after being read, subsequent operations may be rejected to prevent overwrites
- Maximum line length is 2000 characters; longer lines are cut off
- Only files accessible to the sandbox user can be read

## Avoid Repetition
- If you need to repeatedly read the same file, reconsider your approach—read it once and keep the content in mind
- If a file is missing (ENOENT), do not repeatedly attempt to read it unless you expect it to be created
- Avoid reading the same file in quick succession without changes; check if you already have the content
- When exploring a directory, use Glob to list files first, then read only the most relevant ones—do not read every file blindly

## Examples
- Read entire file: file_path="/absolute/path/to/src/index.ts"
- Read from line 100 with limit 50: file_path="/path/to/file.log", offset=100, limit=50
- View an image: file_path="/path/to/screenshot.png"
- Inspect a notebook: file_path="/path/to/analysis.ipynb"

## Additional Notes
- Empty files return a system reminder warning
- If file does not exist, an error will be returned
- Assume this tool can read all files on the machine`