import React from 'react';

interface Props {
  error: any;
  onDone: () => void;
}

export function InvalidConfigDialog({ error, onDone }: Props): React.ReactNode {
  return null; // Simplified: no dialog
}
