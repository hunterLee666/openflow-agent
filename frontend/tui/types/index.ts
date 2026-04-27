export type SenderType = "user" | "assistant" | "system" | "tool"

export type ToolStatus = "running" | "success" | "error" | "pending"

export type ThemeName = "default" | "atomOne" | "dracula" | "github"

export interface Message {
  id: string
  sender: SenderType
  content: string
  timestamp: Date
  streaming?: boolean
  toolName?: string
  toolStatus?: ToolStatus
}

export interface ThemeColors {
  name: string
  background: string
  foreground: string
  lightBlue: string
  accentBlue: string
  accentPurple: string
  accentCyan: string
  accentGreen: string
  accentYellow: string
  accentRed: string
  comment: string
  gray: string
  diffAdded: string
  diffRemoved: string
  diffModified: string
  gradientColors: string[]
}

export interface AppConfig {
  apiKey: string
  provider: string
  model: string
  baseURL: string
  theme: ThemeName
  verbose: boolean
}
