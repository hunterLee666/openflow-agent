export const DESCRIPTION = 'Search for text patterns inside files'

export const PROMPT = `Search one or more files for a literal string or regular expression.

## When to Use
- Find specific text, patterns, or references across the codebase
- Locate where a function, variable, or configuration appears
- Search multiple files efficiently without reading them individually

## Approach
- Prefer glob patterns over manual directory-by-directory scanning
- Use regex=true for pattern matching (e.g., finding imports, function signatures)
- Keep case_sensitive=true for exact matches; use case_sensitive=false for general text search
- Narrow the search path when possible (e.g., "src/" instead of "**/*") to reduce noise and performance cost

## Parameters
- path (required): File path or glob pattern (e.g., "src/**/*.ts", "package.json")
- pattern (required): The text or regex pattern to search for
- regex (optional): If true, treats pattern as a regular expression (default: false)
- case_sensitive (optional): If false, performs case-insensitive search (default: true)
- include (optional): Additional file pattern to filter by extension (e.g., "*.ts")

## Output
- Array of matches with: file path, line number, column number, and a preview of the matched text
- Matches are limited per request to avoid overwhelming responses; refine your query if needed

## Constraints
- Search is confined to the sandbox workspace directory
- Very broad patterns (e.g., "**/*") may produce many results and can be throttled
- Regex patterns should be simple; avoid complex patterns that could degrade performance

## Safety/Limitations
- Result sets are capped; you might need to paginate or refine queries
- Only files readable by the sandbox user are included
- Binary files are generally skipped unless specifically targeted

## Avoid Repetition
- Do not repeat the same grep query without adding new constraints or adjusting the pattern
- If initial results are empty or too broad, refine the path or pattern rather than running identical searches
- When searching for a symbol, try using a glob pattern that targets likely directories (src/, lib/, etc.) instead of multiple separate searches
- If you need to search across many file types, do it in a single grep with a broad path rather than one grep per extension
- Avoid running grep in a loop waiting for a file to appear; instead, use appropriate file watching or re-run only when relevant changes occur

## Examples
- Find all TypeScript files containing 'useState': path='src/**/*.ts', pattern='useState'
- Search for error logs case-insensitively: path='logs/', pattern='error', case_sensitive=false
- Use regex to find imports of a module: path='src/', pattern='from .*deepkit', regex=true`
