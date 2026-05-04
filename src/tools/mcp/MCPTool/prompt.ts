export const PROMPT = `Invoke generic MCP (Model Context Protocol) operations.

## When to Use
- For advanced MCP interactions not covered by specialized tools
- When you need to interact with a custom MCP server method

## Approach
- Use ListMcpResourcesTool and ReadMcpResourceTool when possible
- This generic tool may expose lower-level MCP capabilities depending on configuration

## Parameters
Varies based on the specific MCP capability being invoked.

## Output
Depends on the operation; typically returns data from the server.

## Constraints
- Requires an MCP server to be configured and connected
- Some operations may require user approval

## Safety/Limitations
- MCP servers may have their own security and rate limits
- Unexpected results may occur with non-standard uses

## Avoid Repetition
- If a generic operation fails, re-evaluate whether a more specific tool should be used instead

## Notes
- Prefer specialized tools over this generic one when available`