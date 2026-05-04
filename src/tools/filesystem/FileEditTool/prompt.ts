export const DESCRIPTION = `Performs exact string replacements in files.`

export const PROMPT = `Perform exact string replacements in files using find-and-replace semantics.

## When to Use
- Make targeted changes to existing files (fix typos, update values, modify code snippets)
- Replace a specific occurrence when you know the exact content around it
- Update a configuration value or constant

## Approach
- ALWAYS use the FileReadTool first to read the current file content and understand context
- Preserve the exact indentation (tabs/spaces) as it appears in the file—do not re-indent
- The tool matches literal strings, not regex; to replace multiple similar but not identical occurrences, use MultiEditTool or write a script
- If the old_string is not unique, the tool will FAIL—provide more context (surrounding lines) to make the match unique
- Use replace_all=true only when you want to replace every occurrence of the exact old_string in the file
- Never include line number prefixes in old_string or new_string; they are not part of the file content
- After editing, verify the edit by reading the file again if needed

## Parameters
- file_path (required): Absolute path to the file to edit
- old_string (required): Exact text to find in the file
- new_string (required): Text to replace it with
- replace_all (optional): If true, replace all occurrences; default false (replace first only)

## Output
- Confirmation of the edit with changed content
- Shows the diff of what was replaced
- Line numbers where the change occurred

## Constraints
- Must have read the file first (FilePool freshness check)
- Cannot edit Jupyter notebooks (.ipynb); use NotebookEditTool instead
- old_string must match exactly; whitespace differences cause failure
- If old_string appears multiple times and replace_all is false, the tool fails—provide more context to disambiguate

## Safety/Limitations
- Overwrites existing files; cannot be undone automatically
- Large file edits are allowed but may have performance impact
- If the file was modified externally after the last read, the edit may be rejected to prevent conflicts

## Avoid Repetition
- If an edit fails due to ambiguous match, do not retry with same old_string—include more surrounding context
- Do not repeatedly edit the same file in quick succession without checking results; read between edits
- If you need to make multiple changes to different parts of the same file, consider using MultiEditTool to batch them into one round-trip
- Avoid making trivial edits (like single character changes) repeatedly; plan your changes thoughtfully

## Examples
- Replace a version string: file_path="/package.json", old_string='"version": "1.0.0"', new_string='"version": "1.0.1"'
- Update a port number: file_path="./config.yaml", old_string="port: 3000", new_string="port: 3001"
- Replace with more context for uniqueness: include the surrounding 1-2 lines in old_string to ensure single match

## Notes
- Only use emojis if the user explicitly requests it
- For newline handling, include \n characters as they appear in the file`