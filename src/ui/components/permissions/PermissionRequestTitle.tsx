import React from 'react';

export function PermissionRequestTitle(props: { title: string; riskScore?: any }) {
  return <>{props.title}</>;
}

export function textColorForRiskScore(_riskScore?: any): string {
  return 'green';
}
