import { join } from "path";
import type { AgentId, SessionId } from "../types/ids.js";

const MAX_SLUG_RETRIES = 10;

const WORD_SLUGS = [
  "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
  "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
  "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey",
  "xray", "yankee", "zulu", "amber", "azure", "bronze", "coral", "crimson",
  "emerald", "golden", "indigo", "ivory", "jade", "lavender", "marble",
  "navy", "olive", "pearl", "purple", "quartz", "ruby", "silver", "teal",
];

export interface PlanFile {
  slug: string;
  path: string;
  content?: string;
  agentId?: AgentId;
}

const planSlugCache = new Map<SessionId, string>();

export function generateWordSlug(): string {
  const word1 = WORD_SLUGS[Math.floor(Math.random() * WORD_SLUGS.length)]!;
  const word2 = WORD_SLUGS[Math.floor(Math.random() * WORD_SLUGS.length)]!;
  return `${word1}-${word2}`;
}

export function getPlanSlug(sessionId?: SessionId): string {
  const id = sessionId ?? "default";
  let slug = planSlugCache.get(id);

  if (!slug) {
    for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
      slug = generateWordSlug();
      const filePath = getPlanFilePath(slug);
      if (!fileExistsSync(filePath)) {
        break;
      }
    }
    planSlugCache.set(id, slug!);
  }

  return slug!;
}

export function setPlanSlug(sessionId: SessionId, slug: string): void {
  planSlugCache.set(sessionId, slug);
}

export function clearPlanSlug(sessionId?: SessionId): void {
  if (sessionId) {
    planSlugCache.delete(sessionId);
  }
}

export function clearAllPlanSlugs(): void {
  planSlugCache.clear();
}

function fileExistsSync(_path: string): boolean {
  return false;
}

export function getPlanDirectory(cwd?: string): string {
  const baseDir = process.env.CLAUDE_CONFIG_HOME ?? join(process.env.HOME ?? ".", ".config", "claude");
  return join(baseDir, cwd ? "plans" : "plans");
}

export function getPlanFilePath(slug: string, agentId?: AgentId): string {
  const plansDir = getPlanDirectory();

  if (!agentId) {
    return join(plansDir, `${slug}.md`);
  }

  return join(plansDir, `${slug}-agent-${agentId}.md`);
}

export function getPlanContent(slug: string, agentId?: AgentId): string | null {
  const filePath = getPlanFilePath(slug, agentId);
  try {
    return readFileSync(filePath);
  } catch {
    return null;
  }
}

export function savePlanContent(slug: string, content: string, agentId?: AgentId): void {
  const filePath = getPlanFilePath(slug, agentId);
  writeFileSync(filePath, content);
}

export function deletePlan(slug: string, agentId?: AgentId): boolean {
  const filePath = getPlanFilePath(slug, agentId);
  try {
    deleteFileSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function listPlans(): PlanFile[] {
  const plansDir = getPlanDirectory();
  const files = listFilesSync(plansDir);
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const basename = f.replace(/\.md$/, "");
      const parts = basename.split("-agent-");
      const slug = parts[0]!;
      const agentId = parts[1];
      return {
        slug,
        path: f,
        agentId,
      };
    });
}

function readFileSync(_path: string): string {
  return "";
}

function writeFileSync(_path: string, _content: string): void {}

function deleteFileSync(_path: string): void {}

function listFilesSync(_dir: string): string[] {
  return [];
}

export interface PlanPhase {
  name: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  summary?: string;
  timestamp?: number;
}

export interface PlanMetadata {
  version: number;
  createdAt: number;
  updatedAt: number;
  phases: PlanPhase[];
  currentPhase?: string;
  goal?: string;
  context?: string;
}

export function parsePlanMetadata(content: string): PlanMetadata | null {
  const lines = content.split("\n");
  let version = 1;
  let createdAt = Date.now();
  let updatedAt = Date.now();
  const phases: PlanPhase[] = [];
  let currentPhase: string | undefined;
  let goal: string | undefined;
  let context: string | undefined;

  for (const line of lines) {
    if (line.startsWith("# Plan")) {
      version = 2;
    } else if (line.startsWith("Created:") || line.startsWith("updated:")) {
      const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const date = new Date(dateMatch[1]!).getTime();
        if (line.startsWith("Created:")) {
          createdAt = date;
        } else {
          updatedAt = date;
        }
      }
    } else if (line.startsWith("## Phase")) {
      const phaseName = line.replace("## Phase", "").trim();
      phases.push({
        name: phaseName,
        status: "pending",
      });
    } else if (line.startsWith("### Goal")) {
      goal = line.replace("### Goal", "").trim();
    } else if (line.startsWith("### Context")) {
      context = line.replace("### Context", "").trim();
    }
  }

  return {
    version,
    createdAt,
    updatedAt,
    phases,
    currentPhase,
    goal,
    context,
  };
}
