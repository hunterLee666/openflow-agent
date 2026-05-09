/**
 * System & User Context
 *
 * Builds context for the system prompt:
 * - Git status injection (branch, commits, status)
 * - AGENT.md / project context discovery and injection
 * - Working directory info
 * - Date injection
 */

import { execSync } from 'child_process'
import { readFile, stat } from 'fs/promises'
import { join, resolve, relative, dirname } from 'path'

// Memoization cache
let cachedGitStatus: string | null = null
let cachedGitStatusCwd: string | null = null

/**
 * Get git status info for system prompt.
 * Memoized per cwd (cleared on new session).
 */
export async function getGitStatus(cwd: string): Promise<string> {
  if (cachedGitStatus && cachedGitStatusCwd === cwd) {
    return cachedGitStatus
  }

  try {
    const parts: string[] = []

    const gitExec = (cmd: string, timeoutMs = 5000): string | null => {
      try {
        return execSync(cmd, {
          cwd, timeout: timeoutMs, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
        }).trim()
      } catch {
        return null
      }
    }

    // Check if this is a git repo at all
    if (!gitExec('git rev-parse --git-dir')) return ''

    // Current branch
    const branch = gitExec('git rev-parse --abbrev-ref HEAD')
    if (branch) parts.push(`Current branch: ${branch}`)

    // Main branch detection
    const mainBranch = detectMainBranch(cwd)
    if (mainBranch) parts.push(`Main branch: ${mainBranch}`)

    // Git user
    const user = gitExec('git config user.name', 3000)
    if (user) parts.push(`Git user: ${user}`)

    // Status (staged + unstaged)
    const status = gitExec('git status --short')
    if (status) {
      const truncated = status.length > 2000
        ? status.slice(0, 2000) + '\n...(truncated)'
        : status
      parts.push(`Status:\n${truncated}`)
    }

    // Recent commits (only if HEAD exists)
    const hasHead = gitExec('git rev-parse HEAD')
    if (hasHead) {
      const log = gitExec('git log --oneline -5 --no-decorate')
      if (log) parts.push(`Recent commits:\n${log}`)
    }

    cachedGitStatus = parts.join('\n\n')
    cachedGitStatusCwd = cwd

    return cachedGitStatus
  } catch {
    return ''
  }
}

/**
 * Detect the main branch name (main or master).
 */
function detectMainBranch(cwd: string): string | null {
  try {
    const branches = execSync('git branch -l main master', {
      cwd, timeout: 3000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    if (branches.includes('main')) return 'main'
    if (branches.includes('master')) return 'master'
    return null
  } catch {
    return null
  }
}

/**
 * Discover project context files (AGENT.md, CLAUDE.md) in the project.
 */
export async function discoverProjectContextFiles(cwd: string): Promise<string[]> {
  const candidates = [
    join(cwd, 'AGENT.md'),
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
    join(cwd, 'claude.md'),
  ]

  // Also check home directory
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (home) {
    candidates.push(
      join(home, '.claude', 'CLAUDE.md'),
    )
  }

  const found: string[] = []
  for (const path of candidates) {
    try {
      const s = await stat(path)
      if (s.isFile()) {
        found.push(path)
      }
    } catch {
      // File doesn't exist
    }
  }

  return found
}

/**
 * Read project context file content from discovered files.
 */
export async function readProjectContextContent(cwd: string): Promise<string> {
  const files = await discoverProjectContextFiles(cwd)
  if (files.length === 0) return ''

  const parts: string[] = []
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8')
      if (content.trim()) {
        parts.push(`# From ${file}:\n${content.trim()}`)
      }
    } catch {
      // Skip unreadable files
    }
  }

  return parts.join('\n\n')
}

/**
 * Get system context for the system prompt.
 */
export async function getSystemContext(cwd: string): Promise<string> {
  const parts: string[] = []

  const gitStatus = await getGitStatus(cwd)
  if (gitStatus) {
    parts.push(`gitStatus: ${gitStatus}`)
  }

  return parts.join('\n\n')
}

/**
 * Get user context (AGENT.md, date, etc).
 */
export async function getUserContext(cwd: string): Promise<string> {
  const parts: string[] = []

  // Current date
  parts.push(`# currentDate\nToday's date is ${new Date().toISOString().split('T')[0]}.`)

  // Project context files
  const projectCtx = await readProjectContextContent(cwd)
  if (projectCtx) {
    parts.push(projectCtx)
  }

  return parts.join('\n\n')
}

/**
 * Clear memoized context (call between sessions).
 */
export function clearContextCache(): void {
  cachedGitStatus = null
  cachedGitStatusCwd = null
}

// --------------------------------------------------------------------------
// Part 09: Memory System - Multi-level Context Discovery
// --------------------------------------------------------------------------

/**
 * Context file names to search for (in priority order)
 */
const CONTEXT_FILENAMES = ['AGENT.md', 'CLAUDE.md', 'claude.md']

/**
 * Local (gitignored) context file name
 */
const LOCAL_CONTEXT_FILENAME = 'CLAUDE.local.md'

/**
 * Context file layer priority
 */
export type ContextLayer = 'global' | 'project' | 'directory' | 'local'

/**
 * Discovered context file with layer info
 */
export interface DiscoveredContextFile {
  path: string
  layer: ContextLayer
  relativePath: string
}

/**
 * Discover multi-level context files:
 * 1. Global: ~/.claude/CLAUDE.md
 * 2. Project root: <repo>/CLAUDE.md or AGENT.md
 * 3. Directory: <repo>/foo/bar/CLAUDE.md
 * 4. Local: <repo>/.claude/CLAUDE.local.md (gitignored)
 */
export async function discoverMultiLevelContextFiles(
  cwd: string,
  options?: {
    additionalDirs?: string[]
    includeLocal?: boolean
    filenames?: string[]
  }
): Promise<DiscoveredContextFile[]> {
  const filenames = options?.filenames || CONTEXT_FILENAMES
  const includeLocal = options?.includeLocal ?? true
  const results: DiscoveredContextFile[] = []
  
  const home = process.env.HOME || process.env.USERPROFILE || ''
  const root = await findRepoRoot(cwd)
  
  // Layer 1: Global
  for (const name of filenames) {
    const globalPath = join(home, '.claude', name)
    if (await fileExists(globalPath)) {
      results.push({ path: globalPath, layer: 'global', relativePath: globalPath })
    }
  }
  
  // Layer 2: Project root
  for (const name of filenames) {
    const projectPath = join(root, name)
    if (await fileExists(projectPath)) {
      results.push({ path: projectPath, layer: 'project', relativePath: join('<project>', name) })
    }
  }
  
  // Layer 3: Directory-level
  const relativeToRoot = relative(root, cwd)
  const pathParts = relativeToRoot.split('/').filter(Boolean)
  let currentPath = root
  
  for (const part of pathParts) {
    currentPath = join(currentPath, part)
    for (const name of filenames) {
      const dirPath = join(currentPath, name)
      if (await fileExists(dirPath) && !results.some(r => r.path === dirPath)) {
        results.push({ path: dirPath, layer: 'directory', relativePath: join(relative(root, dirPath), name) })
      }
    }
  }
  
  // Layer 4: Local (gitignored)
  if (includeLocal) {
    const localPath = join(root, '.claude', LOCAL_CONTEXT_FILENAME)
    if (await fileExists(localPath)) {
      results.push({ path: localPath, layer: 'local', relativePath: '<project>/.claude/CLAUDE.local.md' })
    }
    const agentLocalPath = join(root, '.claude', 'AGENT.local.md')
    if (await fileExists(agentLocalPath)) {
      results.push({ path: agentLocalPath, layer: 'local', relativePath: '<project>/.claude/AGENT.local.md' })
    }
  }
  
  return results
}

/**
 * Read and concatenate context files with proper layering
 */
export async function readMultiLevelContext(
  cwd: string,
  options?: { includeLocal?: boolean; maxLines?: number }
): Promise<{ content: string; files: DiscoveredContextFile[] }> {
  const files = await discoverMultiLevelContextFiles(cwd, { includeLocal: options?.includeLocal })
  const parts: string[] = []
  const maxLines = options?.maxLines || 200
  
  for (const file of files) {
    try {
      let content = (await readFile(file.path, 'utf-8')).trim()
      if (content) {
        const lines = content.split('\n')
        if (lines.length > maxLines) {
          content = lines.slice(0, maxLines).join('\n') + `\n\n... [truncated from ${lines.length} lines]`
        }
        const layerLabel = `[${file.layer.toUpperCase()}]`
        parts.push(`## ${layerLabel} ${file.relativePath}\n\n${content}`)
      }
    } catch { /* skip */ }
  }
  
  return { content: parts.join('\n\n---\n\n'), files }
}

// --------------------------------------------------------------------------
// Auto Memory Extraction
// --------------------------------------------------------------------------

export interface ExtractedMemory {
  id: string
  content: string
  source: 'user_preference' | 'project_pattern' | 'code_convention' | 'error_pattern' | 'decision'
  confidence: number
  timestamp: number
}

/**
 * Extract memories from conversation history
 */
export async function extractMemoriesFromHistory(
  messages: any[],
  options?: { maxMemories?: number; minConfidence?: number }
): Promise<ExtractedMemory[]> {
  const maxMemories = options?.maxMemories || 10
  const minConfidence = options?.minConfidence || 0.5
  const memories: ExtractedMemory[] = []
  
  const patterns = {
    user_preference: /(?:I prefer|I like|don't use|avoid|use|always|never)/i,
    project_pattern: /(?:we usually|our pattern|convention|standard|best practice)/i,
    code_convention: /(?:naming|style|format|convention)/i,
    error_pattern: /(?:error|bug|fix|issue|problem)/i,
    decision: /(?:decided|chose|agreed|settled on)/i,
  }
  
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    for (const [source, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) {
        const sentences = content.split(/[.!?]+/).filter((s: string) => pattern.test(s))
        for (const sentence of sentences.slice(0, 2)) {
          if (sentence.trim().length > 20) {
            memories.push({
              id: crypto.randomUUID(),
              content: sentence.trim(),
              source: source as ExtractedMemory['source'],
              confidence: 0.6,
              timestamp: Date.now(),
            })
          }
        }
      }
    }
  }
  
  return memories.sort((a, b) => b.confidence - a.confidence).slice(0, maxMemories).filter(m => m.confidence >= minConfidence)
}

// --------------------------------------------------------------------------
// Dual-Model Retrieval (with single model fallback)
// --------------------------------------------------------------------------

export interface MemoryRetrievalResult {
  memory: ExtractedMemory
  score: number
}

export interface DualModelRetrievalConfig {
  fastModel?: string
  preciseModel?: string
  maxResults?: number
}

/**
 * Retrieve relevant memories using dual-model approach
 * With single model: use the same model for both filtering and scoring
 */
export async function retrieveMemories(
  memories: ExtractedMemory[],
  query: string,
  config: DualModelRetrievalConfig,
  _options?: { provider?: any }
): Promise<MemoryRetrievalResult[]> {
  const maxResults = config.maxResults || 5
  
  // Single model fallback: simple keyword matching
  if (!config.preciseModel || config.fastModel === config.preciseModel) {
    return singleModelRetrieval(memories, query, maxResults)
  }
  
  // Dual model: would call fast model first, then precise model
  // For now, fall back to single model
  return singleModelRetrieval(memories, query, maxResults)
}

function singleModelRetrieval(memories: ExtractedMemory[], query: string, maxResults: number): MemoryRetrievalResult[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  
  const scored = memories.map(memory => {
    let score = 0
    const content = memory.content.toLowerCase()
    
    if (content.includes(query.toLowerCase())) score += 10
    for (const word of queryWords) {
      if (content.includes(word)) score += 1
    }
    
    const age = Date.now() - memory.timestamp
    const daysOld = age / (1000 * 60 * 60 * 24)
    if (daysOld < 7) score += 2
    else if (daysOld < 30) score += 1
    
    score += memory.confidence * 3
    return { memory, score }
  })
  
  return scored.filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults).map(r => ({ memory: r.memory, score: r.score }))
}

// --------------------------------------------------------------------------
// Jarvis Dreaming Mode
// --------------------------------------------------------------------------

export interface JarvisDreamConfig {
  enabled?: boolean
  idleThresholdMs?: number
  maxEntries?: number
}

export interface JarvisDreamEntry {
  id: string
  distilledContent: string
  originalSummary: string
  dreamType: 'preference' | 'pattern' | 'context' | 'learning'
  timestamp: number
}

/**
 * Distill conversation logs into structured dream entries
 */
export async function jarvisDream(
  conversationLogs: string[],
  config?: JarvisDreamConfig
): Promise<JarvisDreamEntry[]> {
  const maxEntries = config?.maxEntries || 20
  const entries: JarvisDreamEntry[] = []
  
  const dreamPatterns = {
    preference: /(?:I prefer|don't|avoid|always|never|like to)/i,
    pattern: /(?:usually|typically|often|always happens)/i,
    context: /(?:in the|when|if|unless)/i,
    learning: /(?:learned|figured out|discovered|noticed)/i,
  }
  
  for (const log of conversationLogs.slice(-100)) {
    for (const [type, pattern] of Object.entries(dreamPatterns)) {
      if (pattern.test(log)) {
        entries.push({
          id: crypto.randomUUID(),
          distilledContent: log.slice(0, 200),
          originalSummary: `Extracted from: ${log.slice(0, 100)}...`,
          dreamType: type as JarvisDreamEntry['dreamType'],
          timestamp: Date.now(),
        })
      }
    }
  }
  
  return entries.slice(0, maxEntries)
}

export function shouldTriggerJarvisDream(lastActivityTime: number, config?: JarvisDreamConfig): boolean {
  if (!config?.enabled) return false
  const threshold = config.idleThresholdMs || (1000 * 60 * 30)
  return Date.now() - lastActivityTime > threshold
}

// Helper
async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile()
  } catch {
    return false
  }
}

async function findRepoRoot(cwd: string): Promise<string> {
  let current = cwd
  const home = process.env.HOME || process.env.USERPROFILE || ''
  
  while (current !== home && current !== '/') {
    if (await fileExists(join(current, '.git')) || await fileExists(join(current, 'package.json')) || await fileExists(join(current, 'Cargo.toml'))) {
      return current
    }
    current = dirname(current)
  }
  return cwd
}
