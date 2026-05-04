export const DESCRIPTION =
  'Replace the contents of a specific cell in a Jupyter notebook.'

export const PROMPT = `Edit a Jupyter notebook by replacing, inserting, or deleting a specific cell.

## When to Use
- Update code or markdown in an existing notebook
- Insert new cells at a specific position
- Remove cells that are no longer needed

## Approach
1. Use NotebookReadTool first to read the notebook and identify target cell_number
2. Choose edit_mode: "replace" to replace cell contents, "insert" to add a new cell, "delete" to remove a cell
3. For replace and insert, provide new_source with the full cell content
4. Edits are applied immediately; the notebook file is overwritten

## Parameters
- notebook_path (required): Absolute path to the .ipynb file
- cell_number (required): 0-indexed index of the cell to modify (or insert at)
- edit_mode (required): One of "replace", "insert", "delete"
- new_source (optional): For replace/insert, the full cell source code or markdown text

## Output
- Success status and description of the change
- Updated cell count if applicable

## Constraints
- Must have read the notebook first to know cell structure and indices
- For edit_mode=delete, new_source is not used
- For edit_mode=insert, the new cell is added at the specified index, shifting subsequent cells
- For edit_mode=replace, the existing cell's content is completely overwritten
- Cannot edit notebooks outside the workspace

## Safety/Limitations
- Changes are permanent; no undo
- If the notebook is malformed, the tool may fail
- Ensure your edits produce valid notebook JSON structure (the tool handles this for you at the cell level)

## Avoid Repetition
- Do not repeatedly edit the same cell without verifying the result; read the notebook between edits to confirm state
- If an edit fails due to invalid cell_number, re-read the notebook to get current indices
- Avoid inserting or deleting cells in a loop without clear termination condition; plan the notebook structure before applying changes
- For multiple changes to the same notebook, consider batching them in separate calls but always re-read between modifications to avoid index drift

## Examples
- Replace first code cell: notebook_path="/work/notebook.ipynb", cell_number=0, edit_mode="replace", new_source="import pandas as pd\nprint('hello')"
- Insert a new markdown cell at index 2: cell_number=2, edit_mode="insert", new_source="# New Section"
- Delete cell at index 4: cell_number=4, edit_mode="delete"

## Notes
- Only use emojis if the user explicitly requests it
- Cell content should be plain text; for rich formatting in markdown, use standard Markdown syntax
- Code cells output is not preserved by replace; only the source is set`