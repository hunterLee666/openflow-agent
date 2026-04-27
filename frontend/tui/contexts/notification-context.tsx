import React, { createContext, useContext, useState, useCallback } from "react"
import type { ReactNode } from "react"
import type { Notification } from "@/components"

interface NotificationContextType {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void
  dismissNotification: (id: string) => void
  clearNotifications: () => void
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  addNotification: () => {},
  dismissNotification: () => {},
  clearNotifications: () => {},
})

export const useNotificationContext = () => useContext(NotificationContext)

interface NotificationProviderProps {
  children: ReactNode
}

export const NotificationProvider = ({ children }: NotificationProviderProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const addNotification = useCallback(
    (notification: Omit<Notification, "id" | "timestamp">) => {
      const newNotification: Notification = {
        ...notification,
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        timestamp: Date.now(),
      }
      setNotifications((prev) => [...prev, newNotification])
    },
    []
  )

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        dismissNotification,
        clearNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
