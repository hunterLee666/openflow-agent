export const TOOL_NAME_FOR_PROMPT = 'Glob'

export const DESCRIPTION = `Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
- You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.`

export const PROMPT = `Find files and directories using glob patterns, with results sorted by modification time.

## When to Use
- Locate files by pattern, extension, or directory structure
- Discover all files of a given type (e.g., all .tsx files)
- Enumerate files in a directory tree without knowing exact names

## Approach
- Provide a glob pattern using standard wildcards: * (any chars except /), ** (recursive across directories), ? (single char)
- Results are sorted by modification time (newest first) to help prioritize relevant files
- For recursive searches, use ** (e.g., "src/**/*.ts")
- You can call multiple GlobTool instances in parallel if you need to search multiple root directories or patterns

## Parameters
- pattern (required): Glob pattern string (e.g., "**/*.js", "src/**/*.ts")
- path (optional): Base directory to start from; defaults to workspace root
- dot (optional): Include hidden files (starting with .); default false

## Output
- Array of matching file and directory paths, sorted by modification time (most recent first)
- Paths are relative to the workspace root or the specified base path

## Constraints
- Patterns are confined to the sandbox workspace
- Very broad patterns (like "**/*") may produce many matches and can be throttled

## Safety/Limitations
- Does not follow symlinks outside the workspace
- Large result sets may be truncated; refine pattern if needed

## Avoid Repetition
- Do not repeatedly run the same broad glob pattern; if you need more depth, adjust the pattern
- Avoid running many similar glob patterns in rapid succession; batch them or use a broader pattern and filter with fs_grep
- If you need to repeatedly check for new files, consider using a more targeted pattern or use a file watcher if available
- When you receive the list, do not immediately re-Glob the same pattern unless you expect changes; cache the results

## Examples
- Find all TypeScript files: pattern="src/**/*.ts"
- List all JSON configs: pattern="**/config.*.json"
- Include dotfiles: pattern="**/*.js", dot=true

## Usage Notes
- Prefer GlobTool over Bash ls when you need pattern matching or recursion
- After locating files, use fs_read or fs_grep to inspect contents
- Parallelize: you can make multiple GlobTool calls in the same message for different patterns or paths

## Additional
- This tool complements fs_grep: use Glob to find files, then grep to search within them`