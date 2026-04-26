import { createContext, useContext, useCallback, useState, type ReactNode } from 'react';
import { z } from 'zod';

export const NotificationTypeSchema = z.enum(['info', 'success', 'warning', 'error']);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationPrioritySchema = z.enum(['low', 'medium', 'high', 'immediate']);
export type NotificationPriority = z.infer<typeof NotificationPrioritySchema>;

const BaseNotificationSchema = z.object({
  key: z.string(),
  invalidates: z.array(z.string()).optional(),
  priority: NotificationPrioritySchema,
  timeoutMs: z.number().positive().optional(),
  fold: z.function().optional(),
});
export type BaseNotification = z.infer<typeof BaseNotificationSchema>;

const TextNotificationSchema = BaseNotificationSchema.extend({
  text: z.string(),
  color: z.string().optional(),
});
export type TextNotification = z.infer<typeof TextNotificationSchema>;

const JSXNotificationSchema = BaseNotificationSchema.extend({
  jsx: z.any(),
});
export type JSXNotification = z.infer<typeof JSXNotificationSchema>;

export const NotificationSchema: z.ZodType<BaseNotification & { text?: string; jsx?: ReactNode }> =
  z.union([TextNotificationSchema, JSXNotificationSchema]);
export type Notification = z.infer<typeof NotificationSchema>;

const DEFAULT_TIMEOUT_MS = 8000;

interface NotificationState {
  queue: Notification[];
  current: Notification | null;
}

interface NotificationContextValue {
  notifications: NotificationState;
  addNotification: (notification: Notification) => void;
  removeNotification: (key: string) => void;
  clearAll: () => void;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications(): {
  addNotification: (notification: Notification) => void;
  removeNotification: (key: string) => void;
  clearAll: () => void;
} {
  const context = useContext(NotificationContext);
  if (!context) {
    return {
      addNotification: () => {},
      removeNotification: () => {},
      clearAll: () => {},
    };
  }
  return context;
}

export function useCurrentNotification(): Notification | null {
  const context = useContext(NotificationContext);
  return context?.notifications.current ?? null;
}

export interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationState>({
    queue: [],
    current: null,
  });

  const addNotification = useCallback((notification: Notification) => {
    const validated = NotificationSchema.safeParse(notification);
    if (!validated.success) {
      console.error('Invalid notification:', validated.error);
      return;
    }

    setNotifications((prev) => {
      const target = validated.data;
      const existingIndex = prev.queue.findIndex((n) => n.key === target.key);

      if (existingIndex >= 0) {
        if (target.fold) {
          const existing = prev.queue[existingIndex];
          const folded = target.fold(existing, target) as Notification;
          const newQueue = [...prev.queue];
          newQueue[existingIndex] = folded;
          return { ...prev, queue: newQueue };
        }
        return prev;
      }

      return {
        ...prev,
        queue: [...prev.queue, target],
      };
    });
  }, []);

  const removeNotification = useCallback((key: string) => {
    setNotifications((prev) => ({
      ...prev,
      queue: prev.queue.filter((n) => n.key !== key),
      current: prev.current?.key === key ? null : prev.current,
    }));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications({ queue: [], current: null });
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, clearAll }}>
      {children}
    </NotificationContext.Provider>
  );
}

export default NotificationContext;
