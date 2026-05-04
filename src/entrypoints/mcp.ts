// MCP server stubs
export async function startMCPServer(_name: string, _config: any): Promise<any> {
  return null;
}
export async function stopMCPServer(_name: string): Promise<void> {}
export async function listMCPServers(): Promise<{ name: string; status: string }[]> {
  return [];
}
