import React, { type ReactNode, type ReactElement, useState } from "react";
import { Box } from "./Box.js";
import { Text } from "./Text.js";

export interface Tab {
  id: string;
  label: string;
  content?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  onChange?: (tabId: string) => void;
  variant?: "line" | "boxed";
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = "line",
}: TabsProps): ReactElement {
  const [internalActiveTab, setInternalActiveTab] = useState(
    activeTab || tabs[0]?.id
  );

  const currentTab = internalActiveTab || tabs[0]?.id;

  const handleTabClick = (tabId: string) => {
    setInternalActiveTab(tabId);
    onChange?.(tabId);
  };

  if (variant === "boxed") {
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1} padding={1}>
          {tabs.map((tab) => (
            <Box
              key={tab.id}
              padding={2}
              style={{
                backgroundColor:
                  tab.id === currentTab ? "#3a3a5e" : "#2a2a3e",
                border:
                  tab.id === currentTab
                    ? "1px solid #5a5a7e"
                    : "1px solid #444",
                borderRadius: 4,
                cursor: tab.disabled ? "not-allowed" : "pointer",
                opacity: tab.disabled ? 0.5 : 1,
              }}
              onClick={() => !tab.disabled && handleTabClick(tab.id)}
            >
              <Text
                color={tab.id === currentTab ? "brightWhite" : "white"}
                bold={tab.id === currentTab}
              >
                {tab.label}
              </Text>
            </Box>
          ))}
        </Box>

        <Box flexDirection="column" padding={1}>
          {tabs.map(
            (tab) =>
              tab.id === currentTab &&
              tab.content && (
                <Box key={`content-${tab.id}`}>{tab.content}</Box>
              )
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="row"
        style={{ borderBottom: "1px solid #444" }}
      >
        {tabs.map((tab) => (
          <Box
            key={tab.id}
            padding={2}
            style={{
              borderBottom:
                tab.id === currentTab
                  ? "2px solid #4a9eff"
                  : "2px solid transparent",
              cursor: tab.disabled ? "not-allowed" : "pointer",
              opacity: tab.disabled ? 0.5 : 1,
            }}
            onClick={() => !tab.disabled && handleTabClick(tab.id)}
          >
            <Text
              color={tab.id === currentTab ? "brightWhite" : "dim"}
              bold={tab.id === currentTab}
            >
              {tab.label}
            </Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" padding={1}>
        {tabs.map(
          (tab) =>
            tab.id === currentTab &&
            tab.content && (
              <Box key={`content-${tab.id}`}>{tab.content}</Box>
            )
        )}
      </Box>
    </Box>
  );
}

export default Tabs;
