import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from './text-input';
import { Spinner } from './spinner';

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  placeholder = 'Type your message...',
  autoFocus = true,
}) => {
  const handleSubmit = useCallback((val: string) => {
    if (val.trim()) {
      onSubmit();
    }
  }, [onSubmit]);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box alignItems="center">
        <Text bold color="cyan">
          {'> '}
        </Text>
        <Box flexGrow={1}>
          <TextInput
            value={value}
            onChange={onChange}
            onSubmit={handleSubmit}
            placeholder={placeholder}
            autoFocus={autoFocus}
            width={100}
          />
        </Box>
        {isLoading && <Spinner />}
      </Box>
    </Box>
  );
};
