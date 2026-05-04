import type { McpServerConfig } from '@utils/config';

export async function addMcpServer(_scope: string, _name: string, _config: McpServerConfig): Promise<void> {}
export async function getMcpServer(_scope: string, _name: string): Promise<McpServerConfig | null> {
  return null;
}
export async function listMCPServers(_scope?: string): Promise<{ name: string; config: McpServerConfig }[]> {
  return [];
}
export function parseEnvVars(_input: string): Record<string, string> {
  return {};
}
export async function removeMcpServer(_scope: string, _name: string): Promise<void> {}
export async function getClients(_scope?: string): Promise<any[]> {
  return [];
}
export async function getClientsForCliMcpConfig(_scope: string): Promise<any[]> {
  return [];
}
export async function getMcprcServerStatus(_scope: string, _name: string): Promise<any> {
  return null;
}
export async function ensureConfigScope(_scope: string): Promise<string> {
  return _scope;
}
