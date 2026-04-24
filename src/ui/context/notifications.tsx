import { createContext, useContext, useCallback, useState, type ReactNode } from 'react'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'
export type NotificationPriority = 'low' | 'medium' | 'high' | 'immediate'

export interface BaseNotification {
  key: string
  invalidates?: string[]
  priority: NotificationPriority
  timeoutMs?: number
  fold?: (accumulator: Notification, incoming: Notification) => Notification
}

export interface TextNotification extends BaseNotification {
  text: string
  color?: string
}

export interface JSXNotification extends BaseNotification {
  jsx: ReactNode
}

export type Notification = TextNotification | JSXNotification

const DEFAULT_TIMEOUT_MS = 8000

interface NotificationState {
  queue: Notification[]
  current: Notification | null
}

interface NotificationContextValue {
  notifications: NotificationState
  addNotification: (notification: Notification) => void
  removeNotification: (key: string) => void
  clearAll: () => void
}

export const NotificationContext = createContext<NotificationContextValue | null>(null)

export function useNotifications(): {
  addNotification: (notification: Notification) => void
  removeNotification: (key: string) => void
  clearAll: () => void
} {
  const context = useContext(NotificationContext)
  if (!context) {
    return {
      addNotification: () => {},
      removeNotification: () => {},
      clearAll: () => {},
    }
  }
  return context
}

export function useCurrentNotification(): Notification | null {
  const context = useContext(NotificationContext)
  return context?.notifications.current ?? null
}

interface NotificationProviderProps {
  children: ReactNode
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [state, setState] = useState<NotificationState>({
    queue: [],
    current: null,
  })

  const removeNotification = useCallback((key: string) => {
    setState(prev => ({
      ...prev,
      queue: prev.queue.filter(n => n.key !== key),
      current: prev.current?.key === key ? null : prev.current,
    }))
  }, [])

  const clearAll = useCallback(() => {
    setState({ queue: [], current: null })
  }, [])

  const addNotification = useCallback((notification: Notification) => {
    setState(prev => {
      if (notification.priority === 'immediate') {
        if (prev.current) {
          return {
            ...prev,
            current: notification,
          }
        }
        return {
          ...prev,
          current: notification,
        }
      }

      const existingIndex = prev.queue.findIndex(n => n.key === notification.key)
      if (existingIndex >= 0) {
        const existing = prev.queue[existingIndex]!
        if ('fold' in existing && existing.fold) {
          const folded = existing.fold(existing, notification)
          const newQueue = [...prev.queue]
          newQueue[existingIndex] = folded
          return { ...prev, queue: newQueue }
        }
      }

      const invalidates = notification.invalidates || []
      const filteredQueue = prev.queue.filter(n => !invalidates.includes(n.key))

      return {
        ...prev,
        queue: [...filteredQueue, notification].sort((a, b) => {
          const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 }
          return priorityOrder[a.priority] - priorityOrder[b.priority]
        }),
      }
    })
  }, [])

  return (
    <NotificationContext.Provider value={{ notifications: state, addNotification, removeNotification, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export default NotificationContext