import React from "react"
import { Box, Text } from "ink"
import { useTheme } from "@/contexts/theme-context"

export interface Task {
  id: string
  name: string
  status: "pending" | "running" | "success" | "error" | "cancelled"
  progress?: number
  details?: string
}

export interface TaskPanelProps {
  tasks: Task[]
  title?: string
  maxHeight?: number
}

export const TaskPanel = ({
  tasks,
  title = "Tasks",
  maxHeight,
}: TaskPanelProps) => {
  const { theme } = useTheme()

  const getStatusIcon = (status: Task["status"]) => {
    switch (status) {
      case "pending":
        return "◌"
      case "running":
        return "⟳"
      case "success":
        return "✓"
      case "error":
        return "✗"
      case "cancelled":
        return "○"
    }
  }

  const getStatusColor = (status: Task["status"]) => {
    switch (status) {
      case "pending":
        return theme.comment
      case "running":
        return theme.accentYellow
      case "success":
        return theme.accentGreen
      case "error":
        return theme.accentRed
      case "cancelled":
        return theme.gray
    }
  }

  const renderProgressBar = (progress: number) => {
    const width = 20
    const filled = Math.round((progress / 100) * width)
    const empty = width - filled
    return (
      <Text>
        <Text color={theme.accentBlue}>{"█".repeat(filled)}</Text>
        <Text color={theme.comment}>{"░".repeat(empty)}</Text>
      </Text>
    )
  }

  const runningTasks = tasks.filter((t) => t.status === "running").length
  const completedTasks = tasks.filter((t) => t.status === "success").length

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.comment}>
      <Box flexDirection="row" justifyContent="space-between" paddingX={1} marginBottom={1}>
        <Text bold color={theme.accentBlue}>
          {title}
        </Text>
        <Text color={theme.comment}>
          {completedTasks}/{tasks.length}
        </Text>
      </Box>

      <Box flexDirection="column" height={maxHeight}>
        {tasks.map((task) => (
          <Box key={task.id} flexDirection="column" paddingX={1} paddingY={1}>
            <Box flexDirection="row" alignItems="center">
              <Text color={getStatusColor(task.status)}>
                {getStatusIcon(task.status)}{" "}
              </Text>
              <Text bold>{task.name}</Text>
              {task.progress !== undefined && (
                <Text color={theme.comment}> {task.progress}%</Text>
              )}
            </Box>
            {task.details && (
              <Box paddingLeft={2}>
                <Text color={theme.comment}>{task.details}</Text>
              </Box>
            )}
            {task.progress !== undefined && (
              <Box paddingLeft={2}>{renderProgressBar(task.progress)}</Box>
            )}
          </Box>
        ))}
      </Box>

      {runningTasks > 0 && (
        <Box paddingX={1} marginTop={1}>
          <Text color={theme.accentYellow}>
            ⟳ {runningTasks} task{runningTasks > 1 ? "s" : ""} running...
          </Text>
        </Box>
      )}
    </Box>
  )
}
