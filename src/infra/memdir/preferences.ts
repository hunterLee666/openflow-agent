import { Memdir, getMemdir } from './Memdir'
import type { ConfigSlice, ExperimentalFlags } from '../state/slices/configSlice'

export interface PreferencesFile {
  editor?: {
    theme?: string
    fontSize?: number
    tabSize?: number
  }
  shortcuts?: Record<string, string>
  [key: string]: unknown
}

export interface ProjectContext {
  name: string
  description?: string
  techStack?: string[]
  conventions?: string[]
  notes?: string
  lastAccessed: number
}

export interface DecisionRecord {
  id: string
  title: string
  date: string
  context: string
  decision: string
  consequences?: string
  tags?: string[]
}

export interface MemdirIndex {
  version: number
  lastUpdated: number
  projectCount: number
  hotFiles?: string[]
}

const PREFERENCES_PATH = 'preferences/editor.json'
const FLAGS_PATH = 'preferences/flags.json'
const PROJECTS_DIR = 'projects'
const DECISIONS_DIR = 'decisions'
const INDEX_PATH = 'index.json'

export async function loadPreferences(): Promise<PreferencesFile> {
  const memdir = getMemdir()
  const data = await memdir.readJson<PreferencesFile>(PREFERENCES_PATH)
  return data ?? {}
}

export async function savePreferences(prefs: PreferencesFile): Promise<void> {
  const memdir = getMemdir()
  await memdir.writeJsonAtomic(PREFERENCES_PATH, prefs)
}

export async function loadExperimentalFlags(): Promise<ExperimentalFlags> {
  const memdir = getMemdir()
  const data = await memdir.readJson<ExperimentalFlags>(FLAGS_PATH)
  return data ?? {}
}

export async function saveExperimentalFlags(flags: ExperimentalFlags): Promise<void> {
  const memdir = getMemdir()
  await memdir.writeJsonAtomic(FLAGS_PATH, flags)
}

export async function loadProjectContext(projectSlug: string): Promise<ProjectContext | null> {
  const memdir = getMemdir()
  return memdir.readJson<ProjectContext>(`${PROJECTS_DIR}/${projectSlug}/context.json`)
}

export async function saveProjectContext(projectSlug: string, context: ProjectContext): Promise<void> {
  const memdir = getMemdir()
  context.lastAccessed = Date.now()
  await memdir.writeJsonAtomic(`${PROJECTS_DIR}/${projectSlug}/context.json`, context)
}

export async function listProjectContexts(): Promise<string[]> {
  const memdir = getMemdir()
  return memdir.list(PROJECTS_DIR)
}

export async function loadDecision(projectSlug: string, decisionId: string): Promise<DecisionRecord | null> {
  const memdir = getMemdir()
  return memdir.readJson<DecisionRecord>(`${PROJECTS_DIR}/${projectSlug}/${DECISIONS_DIR}/${decisionId}.json`)
}

export async function saveDecision(projectSlug: string, decision: DecisionRecord): Promise<void> {
  const memdir = getMemdir()
  await memdir.writeJsonAtomic(
    `${PROJECTS_DIR}/${projectSlug}/${DECISIONS_DIR}/${decision.id}.json`,
    decision
  )
}

export async function listDecisions(projectSlug: string): Promise<string[]> {
  const memdir = getMemdir()
  return memdir.list(`${PROJECTS_DIR}/${projectSlug}/${DECISIONS_DIR}`)
}

export async function loadIndex(): Promise<MemdirIndex> {
  const memdir = getMemdir()
  const data = await memdir.readJson<MemdirIndex>(INDEX_PATH)
  return data ?? { version: 1, lastUpdated: Date.now(), projectCount: 0 }
}

export async function saveIndex(index: MemdirIndex): Promise<void> {
  const memdir = getMemdir()
  index.lastUpdated = Date.now()
  await memdir.writeJsonAtomic(INDEX_PATH, index)
}

export async function syncConfigToMemdir(config: ConfigSlice): Promise<void> {
  const memdir = getMemdir()
  await saveExperimentalFlags(config.experimental)
  const prefs: PreferencesFile = {
    permissionMode: config.permissionMode,
    approvalPolicy: config.approvalPolicy,
    defaultModel: config.defaultModel,
    defaultProvider: config.defaultProvider,
  }
  await savePreferences(prefs)
}

export async function hydrateConfigFromMemdir(): Promise<Partial<ConfigSlice>> {
  const flags = await loadExperimentalFlags()
  const prefs = await loadPreferences()
  
  return {
    experimental: flags,
    permissionMode: prefs.permissionMode as ConfigSlice['permissionMode'],
    approvalPolicy: prefs.approvalPolicy as ConfigSlice['approvalPolicy'],
    defaultModel: prefs.defaultModel as string,
    defaultProvider: prefs.defaultProvider as string,
  }
}

export async function initializeMemdir(): Promise<void> {
  const memdir = getMemdir()
  await memdir.ensureDir('preferences')
  await memdir.ensureDir(PROJECTS_DIR)
  
  const index = await loadIndex()
  const projects = await listProjectContexts()
  index.projectCount = projects.length
  await saveIndex(index)
}
