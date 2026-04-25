export { SkillRegistry, createAgentskillsIoCompatibleManifest, SKILL_FILE_NAMES, SKILL_DIR_NAMES } from "./skill-registry.js";
export type { SkillManifest, SkillDefinition, SkillRegistryEntry } from "./skill-registry.js";

export const BUILTIN_SKILLS = [
  "code_review",
  "debug_assistant",
  "test_generator",
  "refactor_assistant",
  "security_audit",
];
