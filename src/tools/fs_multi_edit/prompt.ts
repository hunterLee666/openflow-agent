export const DESCRIPTION = 'Apply multiple string replacements across files'

export const PROMPT = `Apply multiple find-and-replace operations across different files in one batch.

## When to Use
- Make a set of similar changes across multiple files (e.g., rename a variable across several files)
- Update configuration keys in many files at once
- Perform bulk refactoring where each edit is independent (no cross-file dependencies)

## Approach
- Prepare an array of edit operations, each specifying:
  - path (required): file to edit
  - old_string (required): exact text to match
  - new_string (required): replacement
  - replace_all (optional): default false
- Each file's edits are applied sequentially; failures for a particular file are isolated and reported without aborting other files
- Use fs_read before editing files you're unsure about to confirm context
- For edits within a single file that are interdependent, use MultiEditTool instead

## Parameters
- edits (required): Array of { path, old_string, new_string, replace_all? }

## Output
- Per-edit status: "ok" with diff, "skipped" if no match, or "error" with message
- Summary count of successes and failures

## Constraints
- Must have read each file first for freshness, unless policy allows skipping
- old_string must match exactly; if not unique and replace_all=false, that edit fails
- Maximum number of edits per call may be limited

## Safety/Limitations
- Freshness checks prevent overwriting externally modified files
- Failures are isolated; a failing edit does not roll back others
- Do not assume order of execution across different files is guaranteed; treat edits as independent

## Avoid Repetition
- If an edit fails due to stale file, re-read the file and retry only that specific edit, not the entire batch
- Do not include hundreds of tiny edits in one call; split into manageable batches to avoid timeouts
- Avoid repeatedly editing the same file in the same batch with conflicting patterns; consolidate into a single MultiEditTool call for that file
- If many files are failing due to pattern mismatch, adjust the old_string globally rather than retrying identical patterns

## Examples
- Rename "oldService" to "newService" across all TypeScript files: list each file with the same old/new strings
- Update a version string in several config files

## Notes
- Only use emojis if the user explicitly requests it
- For Jupyter notebooks, use NotebookEditTool
- For creating new files, use fs_write; fs_multi_edit is for editing existing files only`