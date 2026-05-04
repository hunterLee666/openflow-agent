export const TOOL_NAME = 'ReadMcpResourceTool'

export const DESCRIPTION = `Reads a specific resource from an MCP server.
- server: The name of the MCP server to read from
- uri: The URI of the resource to read

Usage examples:
- Read a resource from a server: \`readMcpResource({ server: "myserver", uri: "my-resource-uri" })\``

export const PROMPT = `Read the content of a specific resource from an MCP server.

## When to Use
- Retrieve data from a connected MCP server (e.g., memory store, database, API)
- Access resources previously discovered via ListMcpResources
- Load configurations, notes, or other context stored externally

## Approach
1. Identify the server name and resource URI (from ListMcpResources or prior knowledge)
2. Call this tool to fetch the resource content
3. The tool returns the raw resource data; treat it according to the MIME type

## Parameters
- server (required): The MCP server that hosts the resource
- uri (required): The resource's unique identifier

## Output
- Resource content, which may be text, JSON, binary, or other MIME types
- Metadata about the resource (name, description, MIME type)

## Constraints
- The server must be configured and connected
- The URI must be valid and accessible on that server
- Large resources may be truncated or require special handling

## Safety/Limitations
- MCP servers may impose access control; some resources may be denied
- Network latency may affect response time
- Be cautious with untrusted resources; they may contain unexpected data

## Avoid Repetition
- Do not repeatedly read the same resource in quick succession; cache the value locally if needed multiple times
- If a resource read fails (network, not found), fix the server/URI before retrying
- Avoid reading huge resources multiple times; read once and process in memory

## Examples
- Read a note from memory server: readMcpResource({ server: "memory", uri: "notes://meeting-2025-05-05" })
- Fetch config from a settings server: readMcpResource({ server: "config", uri: "app://settings" })

## Notes
- If the resource is a Jupyter notebook, use NotebookReadTool after saving locally, or process appropriately
- Binary resources may be base64-encoded; handle accordingly`