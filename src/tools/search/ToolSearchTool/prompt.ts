export const DESCRIPTION = 'Search for tools and get detailed information about available tools.'

export const PROMPT = `Search for tools and retrieve detailed information about available tools.

This tool implements lazy loading of tool descriptions to save context tokens. Use it when you need to:
1. Discover what tools are available for a specific task
2. Get detailed usage information about a specific tool
3. Find tools by name or capability

Usage:
- If you know the exact tool name, provide it to get detailed information
- If you want to discover tools, provide a capability description
- Without parameters, returns a list of all available tool names

Approach:
- Use this tool BEFORE attempting to use an unfamiliar tool
- Use this tool when you need to understand tool capabilities
- Use this tool to find the right tool for a specific task

Output:
- Tool name, description, and detailed usage instructions
- Input schema with parameter descriptions
- Safety flags (read-only, concurrency-safe)
- Example usage when available

Constraints:
- Only returns information about enabled tools
- Does not execute any tool operations
- Tool descriptions are loaded on-demand to save tokens
`
