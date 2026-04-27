import React, { useState, useMemo } from "react"
import { Box, Text, useInput } from "ink"
import { useTheme } from "@/contexts/theme-context"

export interface CommandItem {
  id: string
  label: string
  description?: string
  shortcut?: string
  category?: string
  action: () => void | Promise<void>
}

export interface CommandPaletteProps {
  commands: CommandItem[]
  onClose: () => void
  placeholder?: string
}

export const CommandPalette = ({
  commands,
  onClose,
  placeholder = "输入命令...",
}: CommandPaletteProps) => {
  const { theme } = useTheme()
  const [search, setSearch] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filteredCommands = useMemo(() => {
    if (!search) return commands
    const lower = search.toLowerCase()
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.description?.toLowerCase().includes(lower)
    )
  }, [commands, search])

  useInput((input, key) => {
    if (key.escape) {
      onClose()
      return
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(filteredCommands.length - 1, prev + 1))
      return
    }

    if (key.return && filteredCommands[selectedIndex]) {
      filteredCommands[selectedIndex].action()
      onClose()
      return
    }

    if (!key.ctrl && !key.meta && !key.tab && input.length === 1) {
      setSearch((prev) => prev + input)
      setSelectedIndex(0)
    }

    if (key.backspace) {
      setSearch((prev) => prev.slice(0, -1))
      setSelectedIndex(0)
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="row" alignItems="center" marginBottom={1}>
        <Text color={theme.accentBlue}>❯ </Text>
        <Text>{search}</Text>
        <Text inverse> </Text>
      </Box>

      <Box flexDirection="column">
        {filteredCommands.length === 0 ? (
          <Text color={theme.comment}>无匹配命令</Text>
        ) : (
          filteredCommands.slice(0, 10).map((cmd, index) => (
            <Box
              key={cmd.id}
              flexDirection="row"
              justifyContent="space-between"
              paddingX={1}
            >
              <Box flexDirection="row" alignItems="center">
                {index === selectedIndex ? (
                  <Text color={theme.accentBlue}>▸ </Text>
                ) : (
                  <Text>  </Text>
                )}
                <Text bold={index === selectedIndex}>{cmd.label}</Text>
                {cmd.category && (
                  <Text color={theme.comment}> ({cmd.category})</Text>
                )}
              </Box>
              <Box flexDirection="row" alignItems="center">
                {cmd.description && (
                  <Text color={theme.comment}>{cmd.description}</Text>
                )}
                {cmd.shortcut && (
                  <Box marginLeft={2}>
                    <Text color={theme.accentYellow}>{cmd.shortcut}</Text>
                  </Box>
                )}
              </Box>
            </Box>
          ))
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.comment}>
          ↑↓ 导航 | Enter 执行 | Esc 关闭
        </Text>
      </Box>
    </Box>
  )
}
