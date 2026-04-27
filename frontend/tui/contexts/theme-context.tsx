import React, { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"
import type { ThemeColors, ThemeName } from "@/types"
import { themes } from "@/themes"

interface ThemeContextType {
  theme: ThemeColors
  themeName: ThemeName
  setTheme: (name: ThemeName) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: themes.default,
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
  const theme = themes[themeName] || themes.default

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme: setThemeName }}>
      {children}
    </ThemeContext.Provider>
  )
}
