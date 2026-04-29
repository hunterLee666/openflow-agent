import { existsSync, readFileSync } from 'fs'
import { dirname, join, parse, relative, resolve, sep } from 'path'
import { homedir } from 'os'

export type InstructionLayer = 'global' | 'project' | 'directory' | 'local'

export type ProjectInstructionFile = {
  absolutePath: string
  relativePathFromGitRoot: string
  filename: 'AGENTS.override.md' | 'AGENTS.md' | 'AGENTS.local.md'
  layer: InstructionLayer
}

const DEFAULT_PROJECT_DOC_MAX_BYTES = 32 * 1024

const GLOBAL_AGENTS_DIR = join(homedir(), '.openflow')
const GLOBAL_AGENTS_PATH = join(GLOBAL_AGENTS_DIR, 'AGENTS.md')
const LOCAL_AGENTS_DIR = '.openflow'
const LOCAL_AGENTS_FILENAME = 'AGENTS.local.md'

function isRegularFile(path: string): boolean {
  try {
    return existsSync(path)
  } catch {
    return false
  }
}

export function findGitRoot(startDir: string): string | null {
  let currentDir = resolve(startDir)
  const fsRoot = parse(currentDir).root

  while (true) {
    const dotGitPath = join(currentDir, '.git')
    if (existsSync(dotGitPath)) {
      return currentDir
    }
    if (currentDir === fsRoot) {
      return null
    }
    currentDir = dirname(currentDir)
  }
}

function getDirsFromGitRootToCwd(gitRoot: string, cwd: string): string[] {
  const absoluteGitRoot = resolve(gitRoot)
  const absoluteCwd = resolve(cwd)

  const rel = relative(absoluteGitRoot, absoluteCwd)
  if (!rel || rel === '.') {
    return [absoluteGitRoot]
  }

  const parts = rel.split(sep).filter(Boolean)
  const dirs: string[] = [absoluteGitRoot]
  for (let i = 0; i < parts.length; i++) {
    dirs.push(join(absoluteGitRoot, ...parts.slice(0, i + 1)))
  }
  return dirs
}

export function getGlobalInstructionFile(): ProjectInstructionFile | null {
  if (!isRegularFile(GLOBAL_AGENTS_PATH)) {
    return null
  }
  
  return {
    absolutePath: GLOBAL_AGENTS_PATH,
    relativePathFromGitRoot: '~/.openflow/AGENTS.md',
    filename: 'AGENTS.md',
    layer: 'global',
  }
}

export function getLocalInstructionFile(cwd: string): ProjectInstructionFile | null {
  const localPath = join(cwd, LOCAL_AGENTS_DIR, LOCAL_AGENTS_FILENAME)
  
  if (!isRegularFile(localPath)) {
    return null
  }
  
  const gitRoot = findGitRoot(cwd)
  const root = gitRoot ?? resolve(cwd)
  
  return {
    absolutePath: localPath,
    relativePathFromGitRoot: relative(root, localPath) || LOCAL_AGENTS_FILENAME,
    filename: LOCAL_AGENTS_FILENAME,
    layer: 'local',
  }
}

export function getProjectInstructionFiles(
  cwd: string,
): ProjectInstructionFile[] {
  const gitRoot = findGitRoot(cwd)
  const root = gitRoot ?? resolve(cwd)
  const dirs = getDirsFromGitRootToCwd(root, cwd)

  const results: ProjectInstructionFile[] = []
  
  const globalFile = getGlobalInstructionFile()
  if (globalFile) {
    results.push(globalFile)
  }

  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i]
    const isRoot = i === 0
    const overridePath = join(dir, 'AGENTS.override.md')
    const agentsPath = join(dir, 'AGENTS.md')

    if (isRegularFile(overridePath)) {
      results.push({
        absolutePath: overridePath,
        relativePathFromGitRoot:
          relative(root, overridePath) || 'AGENTS.override.md',
        filename: 'AGENTS.override.md',
        layer: isRoot ? 'project' : 'directory',
      })
      continue
    }

    if (isRegularFile(agentsPath)) {
      results.push({
        absolutePath: agentsPath,
        relativePathFromGitRoot: relative(root, agentsPath) || 'AGENTS.md',
        filename: 'AGENTS.md',
        layer: isRoot ? 'project' : 'directory',
      })
    }
  }

  const localFile = getLocalInstructionFile(cwd)
  if (localFile) {
    results.push(localFile)
  }

  return results
}

export function getProjectDocMaxBytes(): number {
  const raw = process.env.OPENFLOW_PROJECT_DOC_MAX_BYTES
  if (!raw) return DEFAULT_PROJECT_DOC_MAX_BYTES
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0)
    return DEFAULT_PROJECT_DOC_MAX_BYTES
  return parsed
}

export function readAndConcatProjectInstructionFiles(
  files: ProjectInstructionFile[],
  {
    maxBytes = getProjectDocMaxBytes(),
    includeHeadings = true,
  }: { maxBytes?: number; includeHeadings?: boolean } = {},
): { content: string; truncated: boolean } {
  let totalBytes = 0
  let truncated = false

  const parts: string[] = []

  const truncateUtf8ToBytes = (value: string, bytes: number): string => {
    const buf = Buffer.from(value, 'utf8')
    if (buf.length <= bytes) return value
    return buf.subarray(0, Math.max(0, bytes)).toString('utf8')
  }

  for (const file of files) {
    if (totalBytes >= maxBytes) {
      truncated = true
      break
    }

    let raw: string
    try {
      raw = readFileSync(file.absolutePath, 'utf-8')
    } catch {
      continue
    }

    if (!raw.trim()) continue

    const separator = parts.length > 0 ? '\n\n' : ''
    const separatorBytes = Buffer.byteLength(separator, 'utf8')
    const remainingAfterSeparator = maxBytes - totalBytes - separatorBytes
    if (remainingAfterSeparator <= 0) {
      truncated = true
      break
    }

    const layerLabel: Record<InstructionLayer, string> = {
      global: 'Global',
      project: 'Project Root',
      directory: 'Directory',
      local: 'Local (Personal)',
    }
    
    const heading = includeHeadings
      ? `# ${file.filename} [${layerLabel[file.layer]}]\n\n_Path: ${file.relativePathFromGitRoot}_\n\n`
      : ''

    const block = `${heading}${raw}`.trimEnd()
    const blockBytes = Buffer.byteLength(block, 'utf8')

    if (blockBytes <= remainingAfterSeparator) {
      parts.push(`${separator}${block}`)
      totalBytes += separatorBytes + blockBytes
      continue
    }

    truncated = true
    const suffix = `\n\n... (truncated: project instruction files exceeded ${maxBytes} bytes)`
    const suffixBytes = Buffer.byteLength(suffix, 'utf8')

    let finalBlock = ''
    if (suffixBytes >= remainingAfterSeparator) {
      finalBlock = truncateUtf8ToBytes(suffix, remainingAfterSeparator)
    } else {
      const prefixBudget = remainingAfterSeparator - suffixBytes
      const prefix = truncateUtf8ToBytes(block, prefixBudget)
      finalBlock = `${prefix}${suffix}`
    }

    parts.push(`${separator}${finalBlock}`)
    totalBytes += separatorBytes + Buffer.byteLength(finalBlock, 'utf8')
    break
  }

  return { content: parts.join(''), truncated }
}

export function ensureGlobalAgentsDir(): void {
  if (!existsSync(GLOBAL_AGENTS_DIR)) {
    const { mkdirSync } = require('fs')
    mkdirSync(GLOBAL_AGENTS_DIR, { recursive: true })
  }
}

export function ensureLocalAgentsDir(cwd: string): string {
  const localDir = join(cwd, LOCAL_AGENTS_DIR)
  if (!existsSync(localDir)) {
    const { mkdirSync } = require('fs')
    mkdirSync(localDir, { recursive: true })
  }
  return localDir
}

export function getGitignoreEntryForLocal(): string {
  return `# Personal AGENTS.local.md (should not be committed)\n${LOCAL_AGENTS_DIR}/`
}

export function shouldGitignoreLocal(cwd: string): boolean {
  const gitignorePath = join(cwd, '.gitignore')
  if (!existsSync(gitignorePath)) {
    return false
  }
  
  try {
    const content = readFileSync(gitignorePath, 'utf-8')
    return content.includes(LOCAL_AGENTS_DIR) || content.includes(LOCAL_AGENTS_FILENAME)
  } catch {
    return false
  }
}

export type InstructionLayerInfo = {
  layer: InstructionLayer
  path: string
  exists: boolean
  description: string
}

export function getInstructionLayerInfo(cwd: string): InstructionLayerInfo[] {
  const infos: InstructionLayerInfo[] = []
  
  infos.push({
    layer: 'global',
    path: GLOBAL_AGENTS_PATH,
    exists: isRegularFile(GLOBAL_AGENTS_PATH),
    description: 'Global instructions for all projects on this machine',
  })
  
  const gitRoot = findGitRoot(cwd)
  const root = gitRoot ?? resolve(cwd)
  
  const rootAgentsPath = join(root, 'AGENTS.md')
  infos.push({
    layer: 'project',
    path: rootAgentsPath,
    exists: isRegularFile(rootAgentsPath),
    description: 'Project-level instructions shared with team',
  })
  
  const dirs = getDirsFromGitRootToCwd(root, cwd)
  if (dirs.length > 1) {
    for (let i = 1; i < dirs.length; i++) {
      const dir = dirs[i]
      const dirAgentsPath = join(dir, 'AGENTS.md')
      const relativePath = relative(root, dir)
      infos.push({
        layer: 'directory',
        path: dirAgentsPath,
        exists: isRegularFile(dirAgentsPath),
        description: `Directory-level instructions for ${relativePath}`,
      })
    }
  }
  
  const localPath = join(cwd, LOCAL_AGENTS_DIR, LOCAL_AGENTS_FILENAME)
  infos.push({
    layer: 'local',
    path: localPath,
    exists: isRegularFile(localPath),
    description: 'Personal instructions (should be gitignored)',
  })
  
  return infos
}
