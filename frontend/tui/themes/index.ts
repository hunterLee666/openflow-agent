import { defaultTheme } from "./default";
import { oneDarkTheme } from "./one-dark";
import { monokaiTheme } from "./monokai";
import { draculaTheme } from "./dracula";
import { nordTheme } from "./nord";
import { solarizedTheme } from "./solarized";
import { catppuccinTheme } from "./catppuccin";
import { tokyoNightTheme } from "./tokyo-night";
import { highContrastTheme } from "./high-contrast";
import type { Theme } from "../components/theme-provider";

export type ThemeName =
  | "default"
  | "one-dark"
  | "monokai"
  | "dracula"
  | "nord"
  | "solarized"
  | "catppuccin"
  | "tokyo-night"
  | "high-contrast";

export type ThemeColors = Theme["colors"];

export const themes: Record<ThemeName, Theme> = {
  default: defaultTheme,
  "one-dark": oneDarkTheme,
  monokai: monokaiTheme,
  dracula: draculaTheme,
  nord: nordTheme,
  solarized: solarizedTheme,
  catppuccin: catppuccinTheme,
  "tokyo-night": tokyoNightTheme,
  "high-contrast": highContrastTheme,
};

export {
  defaultTheme,
  oneDarkTheme,
  monokaiTheme,
  draculaTheme,
  nordTheme,
  solarizedTheme,
  catppuccinTheme,
  tokyoNightTheme,
  highContrastTheme,
};
