export const DESCRIPTION = 'Edit a file by replacing old_string with new_string'

export const PROMPT = `Perform a single find-and-replace edit in a file.

## When to Use
- Make a targeted change to a specific file
- Update a line or a small snippet when you know the exact existing text
- Fix typos, update values, or modify a specific code pattern

## Approach
- Combine with fs_read to first read the file and confirm current state
- Provide the exact old_string as it appears in the file (whitespace-sensitive)
- Provide the new_string replacement
- Set replace_all=true if you want to replace every occurrence of old_string; default is to replace first occurrence only
- The tool integrates with FilePool to ensure the file has not changed since last read (freshness)

## Parameters
- file_path (required): Path to the file to edit (absolute recommended)
- old_string (required): Exact text to find
- new_string (required): Replacement text
- replace_all (optional): Boolean; replace all matches if true

## Output
- Confirmation with diff of the change and line number(s)

## Constraints
- Must have read the file first for freshness validation (unless disabled by policy)
- old_string must appear at least once; if multiple matches without replace_all, the tool fails—provide more context to make unique
- Whitespace and indentation must match exactly

## Safety/Limitations
- Overwrites the file in place; no undo
- If the file changed externally after the read, the edit may be rejected to prevent conflicts
- Cannot edit files outside the workspace

## Avoid Repetition
- If the edit fails due to ambiguous old_string, do not retry unchanged; include more surrounding context to disambiguate
- After a successful edit, avoid re-editing the same region multiple times; if further changes are needed, read the updated file first
- For multiple changes to the same file, consider using fs_multi_edit to batch them in one round-trip
- Do not repeatedly attempt to edit a file that doesn't exist; check with fs_glob first

## Examples
- Change a port number: file_path="config.yaml", old_string="port: 3000", new_string="port: 3001"
- Replace a function signature: include a few surrounding lines to ensure uniqueness

## Notes
- Only use emojis if the user explicitly requests it
- For new file creation, use fs_write
- For Jupyter notebooks, use NotebookEditTool`