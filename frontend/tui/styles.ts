import type { ThemeColors } from "@/types"

export interface ComponentStyles {
  header: {
    container: any
    title: any
    badge: any
  }
  message: {
    container: any
    user: any
    assistant: any
    system: any
    tool: any
  }
  input: {
    container: any
    prompt: any
    text: any
    placeholder: any
    cursor: any
  }
  statusBar: {
    container: any
    separator: any
    item: any
    connected: any
    disconnected: any
  }
  dialog: {
    container: any
    title: any
    content: any
    actions: any
  }
  codeBlock: {
    container: any
    header: any
    language: any
    line: any
    lineNumber: any
  }
  taskPanel: {
    container: any
    header: any
    task: any
    progress: any
  }
}

export function createStyles(theme: ThemeColors): ComponentStyles {
  return {
    header: {
      container: { flexDirection: "row", justifyContent: "space-between", paddingY: 1 },
      title: { bold: true, color: theme.accentBlue },
      badge: { color: theme.accentPurple, bold: true },
    },
    message: {
      container: { flexDirection: "column", paddingY: 1 },
      user: { color: theme.accentBlue },
      assistant: { color: theme.accentGreen },
      system: { color: theme.accentYellow },
      tool: { color: theme.accentPurple },
    },
    input: {
      container: { flexDirection: "column" },
      prompt: { color: theme.accentBlue },
      text: {},
      placeholder: { color: theme.comment },
      cursor: { inverse: true },
    },
    statusBar: {
      container: { flexDirection: "column", paddingTop: 1 },
      separator: { color: theme.gray },
      item: { flexDirection: "row" },
      connected: { color: theme.accentGreen },
      disconnected: { color: theme.accentRed },
    },
    dialog: {
      container: { flexDirection: "column", borderStyle: "double", borderColor: theme.accentBlue },
      title: { bold: true, color: theme.accentBlue },
      content: { paddingX: 2, paddingY: 1 },
      actions: { flexDirection: "row", justifyContent: "flex-end", paddingX: 2, paddingBottom: 1 },
    },
    codeBlock: {
      container: { flexDirection: "column", borderStyle: "round", borderColor: theme.comment },
      header: { flexDirection: "row", justifyContent: "space-between", paddingX: 1, marginBottom: 1 },
      language: { color: theme.accentCyan, bold: true },
      line: { flexDirection: "row" },
      lineNumber: { color: theme.comment },
    },
    taskPanel: {
      container: { flexDirection: "column", borderStyle: "round", borderColor: theme.comment },
      header: { flexDirection: "row", justifyContent: "space-between", paddingX: 1, marginBottom: 1 },
      task: { flexDirection: "column", paddingX: 1, paddingY: 1 },
      progress: { color: theme.accentBlue },
    },
  }
}

export const SPACING = {
  xs: 0,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
} as const

export const BORDER_STYLES = {
  single: "single",
  double: "double",
  round: "round",
  bold: "bold",
} as const

export const LAYOUT = {
  defaultHeaderHeight: 3,
  defaultFooterHeight: 5,
  defaultChatMargin: 2,
  minChatHeight: 8,
  maxInputHeight: 4,
} as const
