// Agent loader (stub)
export function clearAgentCache(): void {}
export function setFlagAgentsFromCliJson(_agents: any): void {}
export async function getAgentByType(_type: string): Promise<any> {
  return null;
}
export async function getAvailableAgentTypes(): Promise<string[]> {
  return [];
}
export async function getActiveAgents(): Promise<any[]> {
  return [];
}
export function getAllAgents(): any[] {
  return [];
}
// Types (simplified)
export interface AgentConfig {
  [key: string]: any;
}
export interface AgentSource {
  [key: string]: any;
}
