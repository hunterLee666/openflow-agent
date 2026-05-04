export const TOOL_NAME = 'ListMcpResourcesTool'

export const DESCRIPTION = `Lists available resources from configured MCP servers.
Each resource object includes a 'server' field indicating which server it's from.

Usage examples:
- List all resources from all servers: \`listMcpResources\`
- List resources from a specific server: \`listMcpResources({ server: "myserver" })\``

export const PROMPT = `List available resources from configured MCP (Model Context Protocol) servers.

## When to Use
- Discover what data sources are available via MCP before reading
- Check which servers are connected and what resources they expose
- Debug missing resources or understand available datasets

## Approach
- Optionally specify a server name to filter; if omitted, returns resources from all servers
- Results include URI, name, description, MIME type, and the server it belongs to
- Use these URIs with readMcpResource to fetch actual content

## Parameters
- server (optional): Name of a specific MCP server to query

## Output
- Array of resource objects with fields:
  - uri: unique identifier for the resource
  - name: display name
  - description: what the resource contains
  - mimeType: type of data (text, json, etc.)
  - server: originating server name

## Constraints
- Only lists resources from servers that are currently configured and connected
- Does not fetch resource content; use readMcpResource for that

## Safety/Limitations
- Some resources may be large; reading them may consume significant context
- Access to certain resources may be restricted by server policies

## Avoid Repetition
- Do not list resources repeatedly without changes in server configuration; cache the list in memory
- If no resources appear for a server, verify the server is running and properly configured before retrying
- Avoid calling ListMcpResources in a tight loop; call once per server and then use readMcpResource as needed

## Examples
- List all: listMcpResources()
- Focus on a specific server: listMcpResources({ server: "memory" })

## Notes
- After listing, use readMcpResource with the returned URI to retrieve actual data`