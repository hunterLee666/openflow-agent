import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from './theme-provider';
import { useInput } from '../hooks/use-input';
import { Divider } from './divider';
import { Panel } from './panel';

export interface SettingItem {
  id: string;
  label: string;
  description?: string;
  type: 'toggle' | 'select' | 'input';
  value?: string | boolean;
  options?: { value: string; label: string }[];
  onChange?: (value: string | boolean) => void;
}

export interface SettingsSection {
  title: string;
  items: SettingItem[];
}

export interface SettingsPanelProps {
  sections: SettingsSection[];
  onClose?: () => void;
  width?: number;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  sections,
  onClose,
  width = 50,
}) => {
  const theme = useTheme();
  const [hoveredSection, setHoveredSection] = useState(0);
  const [hoveredItem, setHoveredItem] = useState(0);

  useInput((_input, key) => {
    if (key.escape) {
      onClose?.();
      return;
    }

    if (key.upArrow) {
      if (hoveredItem > 0) {
        setHoveredItem((prev) => prev - 1);
      } else if (hoveredSection > 0) {
        setHoveredSection((prev) => prev - 1);
        setHoveredItem(sections[hoveredSection - 1].items.length - 1);
      }
    } else if (key.downArrow) {
      if (hoveredItem < sections[hoveredSection].items.length - 1) {
        setHoveredItem((prev) => prev + 1);
      } else if (hoveredSection < sections.length - 1) {
        setHoveredSection((prev) => prev + 1);
        setHoveredItem(0);
      }
    } else if (key.return || key.rightArrow) {
      const item = sections[hoveredSection].items[hoveredItem];
      if (item.type === 'toggle' && typeof item.value === 'boolean') {
        item.onChange?.(!item.value);
      }
    } else if (key.leftArrow) {
      const item = sections[hoveredSection].items[hoveredItem];
      if (item.type === 'select' && item.options) {
        const currentIdx = item.options.findIndex((o) => o.value === item.value);
        const prevIndex = currentIdx > 0 ? currentIdx - 1 : item.options.length - 1;
        item.onChange?.(item.options[prevIndex].value);
      }
    }
  });

  return (
    <Panel
      title="Settings"
      borderStyle="single"
      width={width}
    >
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <Text bold color="cyan">Settings</Text>
          <Text dimColor>Esc to close</Text>
        </Box>
        <Divider />

        {sections.map((section, sectionIndex) => (
          <Box key={section.title} flexDirection="column" marginTop={1}>
            <Text bold color={theme.colors.primary}>
              {section.title}
            </Text>
            {section.items.map((item, itemIndex) => {
              const isActive = sectionIndex === hoveredSection && itemIndex === hoveredItem;

              return (
                <Box
                  key={item.id}
                  flexDirection="row"
                  justifyContent="space-between"
                  paddingX={1}
                  paddingY={1}
                  borderStyle="single"
                  borderColor={isActive ? theme.colors.focusRing : 'transparent'}
                >
                  <Box flexDirection="column">
                    <Text bold={isActive}>{item.label}</Text>
                    {item.description && (
                      <Text dimColor>{item.description}</Text>
                    )}
                  </Box>
                  <Box>
                    {item.type === 'toggle' && (
                      <Text color={item.value ? 'green' : 'red'}>
                        {item.value ? '[ON]' : '[OFF]'}
                      </Text>
                    )}
                    {item.type === 'select' && item.options && (
                      <Text>
                        {item.options.find((o) => o.value === item.value)?.label || item.value}
                      </Text>
                    )}
                    {item.type === 'input' && (
                      <Text dimColor>{item.value || '-'}</Text>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Panel>
  );
};
