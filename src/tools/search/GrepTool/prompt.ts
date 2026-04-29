export const TOOL_NAME_FOR_PROMPT = 'Grep'

export const DESCRIPTION = `A powerful search tool built on ripgrep.`

export const PROMPT = `A powerful search tool built on ripgrep.

Approach:
- ALWAYS use Grep for search tasks, NEVER invoke \`grep\` or \`rg\` as a Bash command
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
- Use Task tool for open-ended searches requiring multiple rounds
- Pattern syntax uses ripgrep (not grep) - literal braces need escaping

Output:
- "content" mode shows matching lines with context
- "files_with_matches" mode shows only file paths (default)
- "count" mode shows match counts
- Results are optimized for correct permissions and access

Constraints:
- By default, patterns match within single lines only
- For cross-line patterns, use \`multiline: true\`
- Use \`interface\\{\\}\` to find \`interface{}\` in Go code
- Output may be limited for large result sets`
