import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { useTheme } from "@/contexts/theme-context"

export interface CodeBlockProps {
  code: string
  language?: string
  showLineNumbers?: boolean
  maxHeight?: number
  onCopy?: () => void
}

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  md: "markdown",
  yml: "yaml",
  rs: "rust",
  cpp: "cpp",
  cs: "csharp",
}

export const CodeBlock = ({
  code,
  language = "text",
  showLineNumbers = true,
  maxHeight,
  onCopy,
}: CodeBlockProps) => {
  const { theme } = useTheme()
  const [copied, setCopied] = useState(false)
  const resolvedLang = LANGUAGE_ALIASES[language] ?? language

  useInput((input, key) => {
    if (key.return && onCopy) {
      setCopied(true)
      onCopy()
      setTimeout(() => setCopied(false), 2000)
    }
  })

  const lines = code.split("\n")
  const lineNumbersWidth = String(lines.length).length

  const renderLine = (line: string, index: number) => {
    const lineNumber = showLineNumbers ? (
      <Text color={theme.comment}>
        {String(index + 1).padStart(lineNumbersWidth, " ")}{" "}
      </Text>
    ) : null

    return (
      <Box key={index}>
        {lineNumber}
        <Text wrap="truncate">{highlightLine(line, resolvedLang, theme)}</Text>
      </Box>
    )
  }

  const content = (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Text color={theme.accentCyan} bold>
          {resolvedLang}
        </Text>
        {copied && (
          <Text color={theme.accentGreen}>✓ Copied</Text>
        )}
      </Box>
      <Box flexDirection="column" height={maxHeight}>
        {lines.map((line, i) => renderLine(line, i))}
      </Box>
    </Box>
  )

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.comment}>
      {content}
    </Box>
  )
}

function highlightLine(line: string, _language: string, theme: any): string {
  return line
}
