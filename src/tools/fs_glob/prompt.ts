export const DESCRIPTION = 'List files matching glob patterns'

export const PROMPT = `List files and directories using glob patterns.

## When to Use
- Discover files in the project (e.g., all TypeScript files, all test files)
- Enumerate directory contents with flexible matching
- Find files by extension, name pattern, or location

## Approach
- Provide a glob pattern using standard wildcards:
  - \`*\` matches any characters except directory separators
  - \`**\` matches across directory boundaries recursively
  - \`?\` matches a single character
- Examples: "src/**/*.ts" (all .ts files in src recursively), "*.md" (markdown files in root), "src/*/config.{js,ts}"
- Set dot=true to include hidden files (starting with .)
- Results are limited by default; if truncated, refine your pattern to narrow the search

## Parameters
- pattern (required): Glob pattern string
- dot (optional): Include hidden files; default false
- path (optional): Base directory for the search; defaults to workspace root

## Output
- Array of file and directory paths relative to the workspace root (or the provided path)
- Directories are included if they match the pattern
- Results may be truncated with a warning if the pattern is too broad

## Constraints
- All paths are confined to the sandbox workspace
- Patterns that match too many files may be throttled
- The tool does not follow symlinks outside the workspace

## Safety/Limitations
- Large result sets are truncated; use more specific patterns or combine with fs_grep to narrow
- Only returns names, not file contents

## Avoid Repetition
- Do not repeatedly run the same broad glob pattern (like "\**/*") expecting different results
- If the initial result is truncated, do not retry identical query; instead make the pattern more specific (e.g., "src/**/*.ts" instead of "**/*")
- Avoid running dozens of similar glob patterns in quick succession; batch them if possible or use a single broader pattern with subsequent filtering
- When looking for a specific file, try to narrow by directory first instead of globbing the entire repo repeatedly
- If you need to monitor file creation, do not poll with glob in a tight loop; add delays or consider using file watchers if available

## Examples
- Find all TypeScript files: pattern="src/**/*.ts"
- List all JSON configs: pattern="**/config.*.json"
- Include dotfiles: pattern="**/*", dot=true
- Search only in tests directory: pattern="tests/**/*.py"

## Notes
- Prefer GlobTool over ls for targeted searches; use ls when you need a simple directory listing
- Use fs_grep after globbing to further filter by content if needed`