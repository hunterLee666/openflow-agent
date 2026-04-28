import React, { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"
import { themes, type ThemeName, type ThemeColors } from "../themes"

interface ThemeContextType {
  theme: ThemeColors
  themeName: ThemeName
  setTheme: (name: ThemeName) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: themes.default.colors,
  themeName: "default",
  setTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

interface ThemeProviderProps {
  children: ReactNode
  initialTheme?: ThemeName
}

export const ThemeProvider = ({ children, initialTheme = "default" }: ThemeProviderProps) => {
  const [themeName, setThemeName] = useState<ThemeName>(initialTheme)
  const theme = (themes[themeName] || themes.default).colors

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme: setThemeName }}>
      {children}
    </ThemeContext.Provider>
  )
}
