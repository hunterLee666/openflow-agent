import { NotebookEditTool } from '@tools/NotebookEditTool/NotebookEditTool'

export const DESCRIPTION = `Perform multiple find-and-replace edits to a single file in one atomic operation.

## When to Use
- Make several changes to different parts of the same file efficiently
- Reduce round trips by batching edits that can be applied together
- Apply sequential edits where later ones depend on earlier changes
- Rename symbols, update multiple config values, or refactor code blocks

## Approach
1. Use FileReadTool first to read the current file content and understand context
2. Prepare an array of edit operations, each with old_string (exact match) and new_string
3. Edits are applied in the order provided; each operates on the result of the previous edit
4. If any edit fails (e.g., old_string not found), the entire operation is rolled back (atomicity)
5. Use replace_all=true when you want to replace every occurrence of old_string; default false replaces only first occurrence

## Parameters
- file_path (required): Absolute path to the file to modify
- edits (required): Array of edit objects:
  - old_string (required): Exact text to find (whitespace-sensitive)
  - new_string (required): Replacement text
  - replace_all (optional): Boolean; default false

## Output
- Confirmation of the changes with diffs for each edit
- Line numbers where changes were applied
- Summary message indicating success or failure

## Constraints
- Must have read the file first (freshness check)
- Cannot edit Jupyter notebooks (.ipynb); use NotebookEditTool instead
- old_string must match exactly; include sufficient context to ensure uniqueness
- All edits must succeed for any change to be applied

## Safety/Limitations
- Edits are sequential: design them so earlier edits don't invalidate matches for later ones
- Ensure the final file remains syntactically and semantically correct
- Consider using FileEditTool for trivial single edits; reserve MultiEdit for batches

## Avoid Repetition
- If the entire multi-edit fails, do not retry with identical edits—analyze which edit caused failure and increase context
- Avoid overlapping edits that can conflict; if two edits target the same region, consider combining them
- After a successful batch, re-read the file before making further edits to ensure you're working with latest content
- Do not use MultiEdit for creating many new files; use FileWriteTool for new files
- If you find yourself repeatedly making the same set of edits across different files, consider automating with a script or ask the user about a broader refactor

## Examples
- Rename a variable throughout a file: old_string="const foo = 1", new_string="const bar = 1", replace_all=true
- Update several config keys at once: multiple edits with full line matches
- Create a new file (special case): file_path="/new/file.ts", edits=[{ old_string: "", new_string: "full content here" }] but normally use FileWriteTool

## Notes
- Only use emojis if the user explicitly requests it
- For notebooks, use NotebookEditTool
- This tool is atomic: all-or-nothing to avoid partial updates`