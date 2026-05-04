export const DESCRIPTION =
  'Extract and read source code from all code cells in a Jupyter notebook.'

export const PROMPT = `Read a Jupyter notebook (.ipynb) and extract all code cells with their outputs.

## When to Use
- Inspect the contents of a Jupyter notebook
- Review code, outputs, and visualizations from data analysis or experiments
- Gather context before editing a notebook cell

## Approach
- Provide the absolute notebook_path
- The tool returns all cells, preserving their original order
- Code cells include their outputs (if any); markdown and raw cells are included as well
- Useful for understanding the notebook structure and content programmatically

## Parameters
- notebook_path (required): Absolute path to the .ipynb file

## Output
- List of cells with their type (code, markdown, raw), source, and outputs (for code cells)
- For code cells, output may include text, images, or other display data
- Cell indices are provided for reference (0-indexed)

## Constraints
- Path must be within the sandbox workspace
- Large notebooks may produce large outputs; consider reading specific cells if tool supports it (future extension)
- Cannot modify the notebook; use NotebookEditTool for edits

## Safety/Limitations
- Read-only; does not alter the file
- Binary cell outputs (images, plots) are returned in encoded form

## Avoid Repetition
- If you need to re-read the same notebook multiple times, cache its content in your memory instead of repeatedly calling this tool
- If the notebook is missing, do not retry unless you expect it to be created
- Avoid reading notebooks that are extremely large; consider extracting only needed cells if you implement selective reading

## Examples
- Read a notebook: notebook_path="/project/analysis/experiment1.ipynb"
- After reading, use cell indices to target specific cells for editing with NotebookEditTool

## Additional Notes
- For editing notebook cells, use NotebookEditTool with edit_mode=replace, insert, or delete
- The notebook must be a valid .ipynb file`