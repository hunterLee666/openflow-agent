// Simplified context module - minimal implementation
export async function getInstructionFilesNote(): Promise<string | null> {
  return null;
}

export function setContext(_key: string, _value: string): void {}
export function removeContext(_key: string): void {}
export function getReadme(): Promise<string | null> {
  return Promise.resolve(null);
}
export function getCurrentPlanMode(): Promise<string> {
  return Promise.resolve('default');
}
export function setPlanMode(_mode: string): void {}
export function getContext(): Record<string, any> {
  return {};
}
export function clearContext(): void {}
