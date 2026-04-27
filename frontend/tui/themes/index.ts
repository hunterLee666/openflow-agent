import type { ThemeColors } from "@/types"

export const defaultTheme: ThemeColors = {
  name: "default",
  background: "#181818",
  foreground: "#F8F8F2",
  lightBlue: "#82AAFF",
  accentBlue: "#61AFEF",
  accentPurple: "#BD93F9",
  accentCyan: "#8BE9FD",
  accentGreen: "#50FA7B",
  accentYellow: "#F1FA8C",
  accentRed: "#FF5555",
  comment: "#6272A4",
  gray: "#ABB2BF",
  diffAdded: "#A6E3A1",
  diffRemoved: "#F38BA8",
  diffModified: "#89B4FA",
  gradientColors: ["#4796E4", "#847ACE", "#C3677F"],
}

export const atomOneTheme: ThemeColors = {
  name: "atomOne",
  background: "#282C34",
  foreground: "#ABB2BF",
  lightBlue: "#61AFEF",
  accentBlue: "#61AFEF",
  accentPurple: "#C678DD",
  accentCyan: "#56B6C2",
  accentGreen: "#98C379",
  accentYellow: "#E5C07B",
  accentRed: "#E06C75",
  comment: "#5C6370",
  gray: "#ABB2BF",
  diffAdded: "#98C379",
  diffRemoved: "#E06C75",
  diffModified: "#61AFEF",
  gradientColors: ["#61AFEF", "#C678DD", "#E06C75"],
}

export const draculaTheme: ThemeColors = {
  name: "dracula",
  background: "#282A36",
  foreground: "#F8F8F2",
  lightBlue: "#8BE9FD",
  accentBlue: "#6272A4",
  accentPurple: "#BD93F9",
  accentCyan: "#8BE9FD",
  accentGreen: "#50FA7B",
  accentYellow: "#F1FA8C",
  accentRed: "#FF5555",
  comment: "#6272A4",
  gray: "#6272A4",
  diffAdded: "#50FA7B",
  diffRemoved: "#FF5555",
  diffModified: "#8BE9FD",
  gradientColors: ["#BD93F9", "#8BE9FD", "#50FA7B"],
}

export const githubTheme: ThemeColors = {
  name: "github",
  background: "#0D1117",
  foreground: "#C9D1D9",
  lightBlue: "#58A6FF",
  accentBlue: "#58A6FF",
  accentPurple: "#BC8CFF",
  accentCyan: "#39D2C0",
  accentGreen: "#3FB950",
  accentYellow: "#D29922",
  accentRed: "#F85149",
  comment: "#8B949E",
  gray: "#8B949E",
  diffAdded: "#3FB950",
  diffRemoved: "#F85149",
  diffModified: "#58A6FF",
  gradientColors: ["#58A6FF", "#BC8CFF", "#3FB950"],
}

export const themes: Record<string, ThemeColors> = {
  default: defaultTheme,
  atomOne: atomOneTheme,
  dracula: draculaTheme,
  github: githubTheme,
}
