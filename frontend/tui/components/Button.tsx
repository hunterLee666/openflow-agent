import React, { type ReactNode, type ReactElement, useCallback } from "react";
import { Text } from "./Text.js";
import { Box } from "./Box.js";

export interface ButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  focused?: boolean;
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "medium",
  disabled = false,
  focused = false,
}: ButtonProps): ReactElement {
  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          bg: focused ? "#3a5a8e" : "#2a4a7e",
          border: "#4a6a9e",
          text: "brightWhite" as const,
        };
      case "danger":
        return {
          bg: focused ? "#8e3a3a" : "#7e2a2a",
          border: "#9e4a4a",
          text: "brightWhite" as const,
        };
      case "secondary":
      default:
        return {
          bg: focused ? "#3a3a4e" : "#2a2a3e",
          border: "#4a4a5e",
          text: focused ? "brightWhite" : "white",
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case "small":
        return { padding: 2, fontSize: 10 };
      case "large":
        return { padding: 4, fontSize: 14 };
      case "medium":
      default:
        return { padding: 3, fontSize: 12 };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      padding={sizeStyles.padding}
      style={{
        backgroundColor: disabled ? "#333" : variantStyles.bg,
        border: `1px solid ${disabled ? "#444" : variantStyles.border}`,
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
      onClick={disabled ? undefined : onClick}
    >
      <Text
        color={disabled ? "dim" : variantStyles.text}
        style={{ fontSize: sizeStyles.fontSize }}
      >
        [{children}]
      </Text>
    </Box>
  );
}

export interface IconButtonProps {
  icon?: string;
  onClick?: () => void;
  label?: string;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  focused?: boolean;
}

export function IconButton({
  icon = "[?]",
  onClick,
  label,
  variant = "secondary",
  disabled = false,
  focused = false,
}: IconButtonProps): ReactElement {
  const getBgColor = () => {
    if (disabled) return "#333";
    switch (variant) {
      case "primary":
        return focused ? "#3a5a8e" : "#2a4a7e";
      case "danger":
        return focused ? "#8e3a3a" : "#7e2a2a";
      default:
        return focused ? "#3a3a4e" : "#2a2a3e";
    }
  };

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      padding={2}
      style={{
        backgroundColor: getBgColor(),
        border: "1px solid #444",
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
      onClick={disabled ? undefined : onClick}
    >
      <Text color={disabled ? "dim" : "brightWhite"}>{icon}</Text>
      {label && (
        <Text color={disabled ? "dim" : "white"} style={{ marginLeft: 4, fontSize: 12 }}>
          {label}
        </Text>
      )}
    </Box>
  );
}

export default Button;
