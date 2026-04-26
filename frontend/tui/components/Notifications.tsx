import React, {
  type ReactNode,
  type ReactElement,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";
import { Spinner } from "./Spinner.js";
import { z } from "zod";

export const NotificationTypeSchema = z.enum(["info", "success", "warning", "error"])
export type NotificationType = z.infer<typeof NotificationTypeSchema>

export const NotificationSchema = z.object({
  id: z.string(),
  type: NotificationTypeSchema,
  title: z.string().optional(),
  message: z.string(),
  duration: z.number().optional(),
  dismissible: z.boolean().optional(),
})
export type Notification = z.infer<typeof NotificationSchema>

export const NotificationsPropsSchema = z.object({
  notifications: z.array(NotificationSchema).optional(),
  maxVisible: z.number().optional(),
  position: z.enum(["top", "bottom"]).optional(),
  onDismiss: z.function().args(z.string()).returns(z.void()).optional(),
})
export type NotificationsProps = z.infer<typeof NotificationsPropsSchema>

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  info: "cyan",
  success: "green",
  warning: "yellow",
  error: "red",
};

const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✗",
};

export function Notifications({
  notifications = [],
  maxVisible = 5,
  position = "top",
  onDismiss,
}: NotificationsProps): ReactElement {
  const visibleNotifications = notifications.slice(0, maxVisible);

  return (
    <Box
      flexDirection="column"
      gap={1}
      style={{
        position: "absolute",
        [position]: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      {visibleNotifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} onDismiss={onDismiss} />
      ))}
    </Box>
  );
}

interface NotificationItemProps {
  notification: Notification;
  onDismiss?: (id: string) => void;
}

function NotificationItem({
  notification,
  onDismiss,
}: NotificationItemProps): ReactElement {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      onDismiss?.(notification.id);
    }, 300);
  }, [notification.id, onDismiss]);

  useEffect(() => {
    if (notification.duration && notification.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, notification.duration);

      return () => clearTimeout(timer);
    }
  }, [notification.duration, handleDismiss]);

  if (!isVisible) {
    return <></>;
  }

  return (
    <Box
      flexDirection="row"
      alignItems="flex-start"
      gap={1}
      padding={1}
      style={{
        backgroundColor: "#1a1a2e",
        border: `1px solid ${NOTIFICATION_COLORS[notification.type]}44`,
        borderRadius: 4,
        opacity: isExiting ? 0 : 1,
        transition: "opacity 0.3s ease",
        pointerEvents: notification.dismissible ? "auto" : "none",
        maxWidth: 400,
      }}
    >
      <Text color={NOTIFICATION_COLORS[notification.type]}>
        {NOTIFICATION_ICONS[notification.type]}
      </Text>

      <Box flexDirection="column" flex={1} gap={1}>
        {notification.title && (
          <Text bold color={NOTIFICATION_COLORS[notification.type]}>
            {notification.title}
          </Text>
        )}
        <Text color="white" style={{ fontSize: 12 }}>
          {notification.message}
        </Text>
      </Box>

      {notification.dismissible && (
        <Box onClick={handleDismiss}>
          <Text color="dim" style={{ cursor: "pointer" }}>
            ✗
          </Text>
        </Box>
      )}
    </Box>
  );
}

export interface UseNotificationsReturn {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export function useNotifications(
  initialNotifications: Notification[] = []
): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>(
    initialNotifications
  );

  const addNotification = useCallback(
    (notification: Omit<Notification, "id">) => {
      const id = `notification_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const newNotification: Notification = {
        ...notification,
        id,
      };

      setNotifications((prev) => [...prev, newNotification]);

      return id;
    },
    []
  );

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
  };
}

export default Notifications;
