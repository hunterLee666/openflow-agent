export interface ParsedKeystroke {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  super: boolean
}

export type Chord = ParsedKeystroke[]

export interface KeybindingBlock {
  context: string
  bindings: Record<string, string | null>
}

export interface ParsedBinding {
  chord: Chord
  action: string | null
  context: string
  description?: string
}

export interface ResolvedKey {
  key: string
  display: string
}

export type Platform = 'macos' | 'windows' | 'linux' | 'wsl' | 'unknown'
