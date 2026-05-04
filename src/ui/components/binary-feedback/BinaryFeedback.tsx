import React from 'react';

interface Props {
  m1: any;
  m2: any;
  resolve: (result: any) => void;
  debug: boolean;
  erroredToolUseIDs: Set<string>;
  inProgressToolUseIDs: Set<string>;
  normalizedMessages: any[];
  tools: any[];
  unresolvedToolUseIDs: Set<string>;
  verbose: boolean;
}

export function BinaryFeedback(_props: Props): React.ReactNode {
  // Binary feedback is not implemented in simplified mode
  return null;
}

