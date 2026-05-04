// Skill marketplace (simplified stub)
export async function getAvailableSkills(): Promise<any[]> {
  return [];
}
export async function installSkill(_skillId: string): Promise<void> {}
export async function uninstallSkill(_skillId: string): Promise<void> {}
export function isSkillInstalled(_skillId: string): boolean {
  return false;
}
