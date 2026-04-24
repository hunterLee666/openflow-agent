export type RGBColor = `rgb(${number},${number},${number})`
export type HexColor = `#${string}`
export type Ansi256Color = `ansi256(${number})`

export type Color = RGBColor | HexColor | Ansi256Color

export type TextStyles = {
  readonly color?: Color
  readonly backgroundColor?: Color
  readonly dim?: boolean
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly inverse?: boolean
}

export interface Theme {
  autoAccept: string
  bashBorder: string
  claude: string
  claudeShimmer: string
  permission: string
  permissionShimmer: string
  planMode: string
  ide: string
  promptBorder: string
  promptBorderShimmer: string
  text: string
  inverseText: string
  inactive: string
  inactiveShimmer: string
  subtle: string
  suggestion: string
  remember: string
  background: string
  success: string
  error: string
  warning: string
  merged: string
  warningShimmer: string
  diffAdded: string
  diffRemoved: string
  diffAddedDimmed: string
  diffRemovedDimmed: string
  diffAddedWord: string
  diffRemovedWord: string
  red_FOR_SUBAGENTS_ONLY: string
  blue_FOR_SUBAGENTS_ONLY: string
  green_FOR_SUBAGENTS_ONLY: string
  yellow_FOR_SUBAGENTS_ONLY: string
  purple_FOR_SUBAGENTS_ONLY: string
  orange_FOR_SUBAGENTS_ONLY: string
  pink_FOR_SUBAGENTS_ONLY: string
  cyan_FOR_SUBAGENTS_ONLY: string
  userMessageBackground: string
  userMessageBackgroundHover: string
  messageActionsBackground: string
  selectionBg: string
  bashMessageBackgroundColor: string
  memoryBackgroundColor: string
  rate_limit_fill: string
  rate_limit_empty: string
  fastMode: string
  fastModeShimmer: string
  clawd_body: string
  clawd_background: string
}

export const THEME_NAMES = [
  'dark',
  'light',
  'light-daltonized',
  'dark-daltonized',
  'light-ansi',
  'dark-ansi',
] as const

export type ThemeName = (typeof THEME_NAMES)[number]

export const THEME_SETTINGS = ['auto', ...THEME_NAMES] as const

export type ThemeSetting = (typeof THEME_SETTINGS)[number]

const lightTheme: Theme = {
  autoAccept: 'rgb(135,0,255)',
  bashBorder: 'rgb(255,0,135)',
  claude: 'rgb(120,190,120)',
  claudeShimmer: 'rgb(160,220,160)',
  permission: 'rgb(130,165,210)',
  permissionShimmer: 'rgb(160,195,235)',
  planMode: 'rgb(0,102,102)',
  ide: 'rgb(130,165,210)',
  promptBorder: 'rgb(153,153,153)',
  promptBorderShimmer: 'rgb(183,183,183)',
  text: 'rgb(0,0,0)',
  inverseText: 'rgb(255,255,255)',
  inactive: 'rgb(102,102,102)',
  inactiveShimmer: 'rgb(142,142,142)',
  subtle: 'rgb(175,175,175)',
  suggestion: 'rgb(130,165,210)',
  remember: 'rgb(130,165,210)',
  background: 'rgb(160,195,160)',
  success: 'rgb(44,122,57)',
  error: 'rgb(171,43,63)',
  warning: 'rgb(150,108,30)',
  merged: 'rgb(135,0,255)',
  warningShimmer: 'rgb(200,158,80)',
  diffAdded: 'rgb(105,219,124)',
  diffRemoved: 'rgb(255,168,180)',
  diffAddedDimmed: 'rgb(199,225,203)',
  diffRemovedDimmed: 'rgb(253,210,216)',
  diffAddedWord: 'rgb(47,157,68)',
  diffRemovedWord: 'rgb(209,69,75)',
  red_FOR_SUBAGENTS_ONLY: 'rgb(220,38,38)',
  blue_FOR_SUBAGENTS_ONLY: 'rgb(37,99,235)',
  green_FOR_SUBAGENTS_ONLY: 'rgb(22,163,74)',
  yellow_FOR_SUBAGENTS_ONLY: 'rgb(202,138,4)',
  purple_FOR_SUBAGENTS_ONLY: 'rgb(124,58,237)',
  orange_FOR_SUBAGENTS_ONLY: 'rgb(249,115,22)',
  pink_FOR_SUBAGENTS_ONLY: 'rgb(219,39,119)',
  cyan_FOR_SUBAGENTS_ONLY: 'rgb(8,145,178)',
  userMessageBackground: 'rgb(230,235,241)',
  userMessageBackgroundHover: 'rgb(220,227,236)',
  messageActionsBackground: 'rgb(130,165,210)',
  selectionBg: 'rgb(184,211,237)',
  bashMessageBackgroundColor: 'rgb(255,245,245)',
  memoryBackgroundColor: 'rgb(240,248,255)',
  rate_limit_fill: 'rgb(37,99,235)',
  rate_limit_empty: 'rgb(226,232,240)',
  fastMode: 'rgb(220,38,38)',
  fastModeShimmer: 'rgb(248,113,113)',
  clawd_body: 'rgb(30,30,30)',
  clawd_background: 'rgb(250,250,250)',
}

const darkTheme: Theme = {
  autoAccept: 'rgb(135,0,255)',
  bashBorder: 'rgb(255,0,135)',
  claude: 'rgb(120,190,120)',
  claudeShimmer: 'rgb(160,220,160)',
  permission: 'rgb(130,165,210)',
  permissionShimmer: 'rgb(160,195,235)',
  planMode: 'rgb(0,102,102)',
  ide: 'rgb(130,165,210)',
  promptBorder: 'rgb(153,153,153)',
  promptBorderShimmer: 'rgb(183,183,183)',
  text: 'rgb(255,255,255)',
  inverseText: 'rgb(0,0,0)',
  inactive: 'rgb(102,102,102)',
  inactiveShimmer: 'rgb(142,142,142)',
  subtle: 'rgb(175,175,175)',
  suggestion: 'rgb(130,165,210)',
  remember: 'rgb(130,165,210)',
  background: 'rgb(30,30,30)',
  success: 'rgb(44,122,57)',
  error: 'rgb(171,43,63)',
  warning: 'rgb(150,108,30)',
  merged: 'rgb(135,0,255)',
  warningShimmer: 'rgb(200,158,80)',
  diffAdded: 'rgb(105,219,124)',
  diffRemoved: 'rgb(255,168,180)',
  diffAddedDimmed: 'rgb(199,225,203)',
  diffRemovedDimmed: 'rgb(253,210,216)',
  diffAddedWord: 'rgb(47,157,68)',
  diffRemovedWord: 'rgb(209,69,75)',
  red_FOR_SUBAGENTS_ONLY: 'rgb(220,38,38)',
  blue_FOR_SUBAGENTS_ONLY: 'rgb(37,99,235)',
  green_FOR_SUBAGENTS_ONLY: 'rgb(22,163,74)',
  yellow_FOR_SUBAGENTS_ONLY: 'rgb(202,138,4)',
  purple_FOR_SUBAGENTS_ONLY: 'rgb(124,58,237)',
  orange_FOR_SUBAGENTS_ONLY: 'rgb(249,115,22)',
  pink_FOR_SUBAGENTS_ONLY: 'rgb(219,39,119)',
  cyan_FOR_SUBAGENTS_ONLY: 'rgb(8,145,178)',
  userMessageBackground: 'rgb(40,40,40)',
  userMessageBackgroundHover: 'rgb(50,50,50)',
  messageActionsBackground: 'rgb(130,165,210)',
  selectionBg: 'rgb(60,60,60)',
  bashMessageBackgroundColor: 'rgb(50,30,30)',
  memoryBackgroundColor: 'rgb(30,40,50)',
  rate_limit_fill: 'rgb(37,99,235)',
  rate_limit_empty: 'rgb(50,50,50)',
  fastMode: 'rgb(220,38,38)',
  fastModeShimmer: 'rgb(248,113,113)',
  clawd_body: 'rgb(30,30,30)',
  clawd_background: 'rgb(45,45,45)',
}

export const THEMES: Record<ThemeName, Theme> = {
  dark: darkTheme,
  light: lightTheme,
  'light-daltonized': lightTheme,
  'dark-daltonized': darkTheme,
  'light-ansi': lightTheme,
  'dark-ansi': darkTheme,
}

export function getTheme(name: ThemeName): Theme {
  return THEMES[name] ?? darkTheme
}

export function resolveTheme(setting: ThemeSetting, systemTheme: ThemeName = 'dark'): ThemeName {
  if (setting === 'auto') {
    return systemTheme
  }
  return setting
}
