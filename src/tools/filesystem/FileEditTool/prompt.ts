export const DESCRIPTION = `Performs exact string replacements in files.`

export const PROMPT = `Performs exact string replacements in files.

Approach:
- You must use your \`Read\` tool at least once before editing
- Preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix
- The line number prefix format is: spaces + line number + tab
- NEVER include any part of the line number prefix in old_string or new_string
- ALWAYS prefer editing existing files, NEVER write new files unless explicitly required
- Use \`replace_all\` for replacing strings across the entire file

Output:
- Confirmation of the edit with the changed content
- Shows the diff of what was replaced
- Line numbers of the changes

Constraints:
- The edit will FAIL if \`old_string\` is not unique in the file
- Provide a larger string with more context to make it unique
- Cannot edit Jupyter notebooks (.ipynb) - use NotebookEdit tool instead
- Only use emojis if the user explicitly requests it`
