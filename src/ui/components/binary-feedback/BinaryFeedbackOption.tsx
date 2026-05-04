import React from 'react';

interface Props {
  debug: boolean;
  erroredToolUseIDs: Set<string>;
  inProgressToolUseIDs: Set<string>;
  message: any;
  normalizedMessages: any[];
  tools: any[];
  unresolvedToolUseIDs: Set<string>;
  verbose: boolean;
}

export function BinaryFeedbackOption(_props: Props): React.ReactNode {
  // Binary feedback not implemented in simplified mode
  return null;
}
